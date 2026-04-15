# Implementation Plan: Live Cricket Commentary Platform

**Branch**: `001-live-sports-commentary-platform` | **Date**: 2026-04-13 | **Spec**: [spec.md](spec.md)

## Summary

Build a live cricket commentary platform that polls Cricbuzz (via RapidAPI) every 15–30 seconds, detects new ball events, persists them to PostgreSQL, and instantly broadcasts them over WebSocket to all fans subscribed to that match. The backend is a persistent Node.js process combining Express (REST) and a WebSocket server (ws library) on a single port. Fans connect once via WebSocket and receive all live updates automatically — no page refresh, no frontend polling.

## Architecture (Confirmed)

```
Cricbuzz Cricket API (RapidAPI)
        │
        │  Backend polls REST every 15–30s
        ▼
┌─────────────────────────────────┐
│         Node.js Backend         │
│                                 │
│  src/adapters/cricbuzz.js       │  ← polls Cricbuzz, detects new balls
│  src/services/commentary.js     │  ← saves to DB + triggers broadcast
│  src/websocket/broadcaster.js   │  ← pushes to subscribed fans
│  src/routes/matches.js          │  ← REST: match list, history         │
└─────────────────────────────────┘
        │
        │  WebSocket (ws://) — backend pushes on every new ball
        ▼
   Fan's Browser
   (sees update instantly, no refresh)
```

## Technical Context

**Language/Version**: Node.js LTS (v20+), ESM (`"type": "module"`)
**Primary Dependencies**: `express` v5, `ws`, `drizzle-orm` + `pg`, `zod`, `@arcjet/node`, `dotenv`, `node-fetch` (or native fetch)
**External Data Source**: Cricbuzz Cricket API via RapidAPI — REST polling, 500,000 req/month free
**Storage**: PostgreSQL via Neon (managed). Schema: `matches` + `commentary` tables. `pg.Pool` via `drizzle-orm/node-postgres`
**Testing**: Jest with `--experimental-vm-modules` for ESM
**Target Platform**: Hostinger managed Node.js hosting (always-on process — required for persistent WebSocket connections)
**Project Type**: Backend web-service — REST API + WebSocket server on single port
**Performance Goals**: Event delivery to fans <2s from backend receiving Cricbuzz data; WS broadcast <10ms P95; DB write <50ms P95
**Constraints**: 10,000 concurrent WebSocket connections; ghost connection detection within 30s; zero duplicate ball broadcasts
**Scale/Scope**: Single server instance; in-process pub/sub; Neon pool max 20 connections

## Constitution Check

| Principle | Requirement | Status | Notes |
|-----------|------------|--------|-------|
| **I. Real-Time First** | WebSocket for all live delivery; no frontend polling | ✅ PASS | Backend polls Cricbuzz (acceptable — upstream is REST only); fans receive via WebSocket push |
| **II. Connection Stability** | Ping/pong heartbeat; ghost detection ≤30s; exponential backoff | ✅ PASS | 15s ping interval; client reconnects with `lastSequence` cursor |
| **III. Message Protocol** | Typed messages; `type` + `timestamp` on every frame | ✅ PASS | All WS messages typed — see `contracts/websocket-protocol.md` |
| **IV. Test-First (NON-NEGOTIABLE)** | TDD: write tests → fail → implement → pass | ✅ PASS | Jest configured; task ordering enforced in `tasks.md` |
| **V. Performance** | Broadcast <10ms P95; DB <50ms P95; 10k connections | ✅ PASS | Deduplication prevents redundant writes; composite index on hot query path |
| **VI. Observability** | Structured JSON logging; `GET /health` with metrics | ✅ PASS | Health endpoint exposes WS connection count + DB pool status |
| **VII. Security** | ArcJet rate limiting; Zod validation; API key server-side only | ✅ PASS | `RAPIDAPI_KEY` never exposed to browser; ArcJet at upgrade event |

## Project Structure

### Documentation (this feature)

```text
specs/001-live-sports-commentary-platform/
├── spec.md                          # Feature specification
├── plan.md                          # This file
├── research.md                      # Data source + integration research
├── data-model.md                    # Cricket entity schema
├── quickstart.md                    # Developer setup guide
├── contracts/
│   ├── websocket-protocol.md        # WS message schemas
│   └── rest-api.md                  # REST endpoint contracts
├── checklists/
│   └── requirements.md              # Spec quality checklist
└── tasks.md                         # TDD task list (Phase 2 — /speckit.tasks)
```

### Source Code

```text
src/
├── index.js                    # Entry point: http.Server + Express + WebSocketServer
├── health.js                   # GET /health — WS metrics + DB pool status
├── db/
│   ├── db.js                   # pg.Pool + drizzle instance (exists)
│   └── schema.js               # matches + commentary tables (exists, needs index additions)
├── adapters/
│   └── cricbuzz.js             # Cricbuzz poller: setInterval → fetch → detect new balls → publish
├── websocket/
│   ├── server.js               # WebSocketServer (noServer: true)
│   ├── handlers.js             # Message router: subscribe / unsubscribe / ping
│   ├── registry.js             # Map<matchId, Set<WebSocket>> subscription store
│   ├── heartbeat.js            # 15s ping/pong; ghost detection; cleanup
│   └── broadcaster.js          # broadcastToMatch(matchId, payload) + backpressure check
├── routes/
│   ├── matches.js              # GET /api/matches, GET /api/matches/:id
│   └── events.js               # GET /api/matches/:id/events (history + missed events)
├── middleware/
│   ├── arcjet.js               # ArcJet singleton + REST middleware
│   └── validate.js             # Zod validation wrapper
└── services/
    └── commentary.js           # publishEvent(): save to DB → broadcastToMatch()

tests/
├── unit/
│   ├── registry.test.js
│   ├── heartbeat.test.js
│   ├── broadcaster.test.js
│   └── cricbuzz-adapter.test.js
└── integration/
    ├── websocket.test.js
    ├── matches.test.js
    └── events.test.js
```

## Key Implementation Details

### Cricbuzz Adapter — Deduplication Pattern

The adapter must never broadcast the same ball twice. Each ball has a unique `over.ball` identifier from Cricbuzz (e.g., `"15.4"`). The adapter tracks the last seen ball per match:

```js
// src/adapters/cricbuzz.js
const lastSeenBall = new Map(); // Map<matchId, string> e.g. "15.4"

async function pollMatch(matchId, cricbuzzMatchId) {
  const data = await fetchCricbuzz(`/mcenter/v1/${cricbuzzMatchId}/commentary`);
  const latestBall = data.commentaryList[0]; // most recent ball

  if (lastSeenBall.get(matchId) === latestBall.overSep) return; // no new ball

  lastSeenBall.set(matchId, latestBall.overSep);
  await publishEvent(matchId, normalize(latestBall)); // save + broadcast
}

setInterval(() => activeLiveMatches.forEach(pollMatch), 15_000);
```

### Publish Flow (write-then-broadcast)

```js
// src/services/commentary.js
async function publishEvent(matchId, eventData) {
  const [saved] = await db.insert(commentary).values({ matchId, ...eventData }).returning();
  broadcastToMatch(matchId, { type: 'ball_event', ...saved }); // broadcast AFTER commit
}
```

### Environment Variables Required

```bash
DATABASE_URL=          # Neon pooler endpoint
RAPIDAPI_KEY=          # Cricbuzz via RapidAPI (never exposed to browser)
ARCJET_KEY=            # ArcJet rate limiting
ARCJET_ENV=development # Remove in production
PORT=8000
```

## Complexity Tracking

> No constitution violations requiring justification.

## Decisions Log

| Decision | Choice | Reason |
|----------|--------|--------|
| Data source | Cricbuzz via RapidAPI | Same source as Google Search; 500k req/month free; ball-by-ball commentary |
| Polling vs WebSocket upstream | REST polling every 15–30s | Cricbuzz does not expose a public WebSocket API |
| Sport scope | Cricket only | Focused v1; football deferred |
| Fan delivery | WebSocket push | True real-time; no frontend polling |
| Deduplication | `lastSeenBall` Map per match | Prevents duplicate broadcasts when poll returns same data |
| Frontend | Not in scope for v1 | Backend API + WebSocket only; frontend is a separate concern |
