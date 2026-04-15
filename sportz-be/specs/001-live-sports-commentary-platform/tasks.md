# Tasks: Live Cricket Commentary Platform

**Input**: Design documents from `/specs/001-live-sports-commentary-platform/`
**Branch**: `001-live-sports-commentary-platform`
**Generated**: 2026-04-13

**How to use**: Work through tasks in order. Each phase ends with a checkpoint — stop, test, confirm it works before moving on. Tasks marked [P] can be done in parallel (different files, no conflicts).

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can be done in parallel with other [P] tasks in the same phase
- **[US#]**: Which user story this task delivers
- Each task = one file or one clear action

---

## Phase 1: Setup

**Purpose**: Install packages, configure environment, create folder structure, migrate database.

- [ ] T001 Install missing packages: `npm install ws @arcjet/node zod` and `npm install --save-dev jest @jest/globals`
- [ ] T002 Update `package.json` — set `"test": "node --experimental-vm-modules node_modules/.bin/jest"` and add `"jest": { "testEnvironment": "node", "transform": {} }`
- [ ] T003 Create `.env` file at project root with `DATABASE_URL`, `RAPIDAPI_KEY`, `ARCJET_KEY`, `ARCJET_ENV=development`, `PORT=8000`, `POLL_INTERVAL_MS=15000`
- [ ] T004 Create folder structure: `src/adapters/`, `src/websocket/`, `src/routes/`, `src/middleware/`, `src/services/`, `tests/unit/`, `tests/integration/`
- [ ] T005 Update `src/db/schema.js` — add cricket columns to `matches` table (`cricbuzzMatchId`, `seriesName`, `matchFormat`, `venue`, `homeWickets`, `awayWickets`, `homeOvers`, `awayOvers`), add `withTimezone: true` to all timestamps, add indexes (`matches_status_idx`, `matches_cricbuzz_idx`, `commentary_match_seq_idx`)
- [ ] T006 Run `npm run db:generate` then `npm run db:migrate` — apply schema changes to Neon

**Checkpoint**: `npm run db:studio` — verify new columns and indexes exist on both tables.

---

## Phase 2: Foundation

**Purpose**: Core infrastructure every user story depends on. MUST be complete before Phase 3.

**⚠️ CRITICAL**: No user story work begins until this phase is complete.

- [ ] T007 Update `src/db/db.js` — ensure `pg.Pool` uses `process.env.DATABASE_URL`, `max: 20`, `idleTimeoutMillis: 30000`, `connectionTimeoutMillis: 5000`; export `pool` and `db` (drizzle instance)
- [ ] T008 [P] Create `src/middleware/validate.js` — export a `validate(schema)` middleware wrapper that runs Zod `.safeParse()` on `req.body`, returns `400` with `{ error, issues }` on failure, calls `next()` on success
- [ ] T009 [P] Create `src/services/commentary.js` — export `publishEvent(matchId, eventData)` that inserts into `commentary` table using drizzle, returns the saved row (broadcast wired in Phase 3)
- [ ] T010 Create `src/index.js` — create `http.createServer(app)`, create `new WebSocketServer({ noServer: true })`, listen on `PORT`, export `wss` for use by other modules
- [ ] T011 [P] Create `src/health.js` — export Express router with `GET /health` returning `{ status: "ok", timestamp, uptime, websocket: { connectedClients: 0 }, database: { status: "ok" } }` (metrics wired in later phases)
- [ ] T012 Wire `src/index.js` — `app.use(express.json())`, mount `GET /health` from `src/health.js`, mount `/api/matches` and `/api/matches/:id/events` placeholders (404 stubs for now)

**Checkpoint**: `npm run dev` starts without errors. `curl http://localhost:8000/health` returns `{ "status": "ok" }`.

---

## Phase 3: User Story 1 — Real-Time Match Event Updates (P1) 🎯 MVP

**Goal**: Backend polls Cricbuzz every 15–30s, detects new balls, saves to PostgreSQL, broadcasts to all connected fans over WebSocket.

**Independent Test**: Start server → connect with `wscat -c ws://localhost:8000/ws` → subscribe to a live match → see `ball_event` messages arrive automatically every ~15–30s.

### Tests for User Story 1

> **Write these first — verify they FAIL — then implement**

- [x] T013 [P] [US1] Write `tests/unit/cricbuzz-adapter.test.js` — test `deduplicateBall()`: same ball key called twice should return `false` on second call; new ball key should return `true`
- [x] T014 [P] [US1] Write `tests/unit/commentary.test.js` — test `publishEvent()`: mock drizzle insert, verify it receives correct `matchId` and `eventData`, verify it returns the saved row

### Implementation for User Story 1

- [x] T015 [US1] Create `src/adapters/cricbuzz.js` — export `fetchLiveMatches()` that calls `GET /matches/v1/live` on Cricbuzz RapidAPI using `RAPIDAPI_KEY` header, returns array of live match objects
- [x] T016 [US1] Add `fetchCommentary(cricbuzzMatchId)` to `src/adapters/cricbuzz.js` — calls `GET /mcenter/v1/{matchId}/commentary`, returns `commentaryList` array
- [x] T017 [US1] Add `deduplicateBall(matchId, ballKey)` to `src/adapters/cricbuzz.js` — uses `Map<matchId, lastBallKey>`, returns `true` if ball is new, `false` if already seen
- [x] T018 [US1] Add `normalizeBall(rawBall, matchId)` to `src/adapters/cricbuzz.js` — maps Cricbuzz `commentaryList[0]` fields to `{ matchId, minute, sequence, period, eventType, actor, team, message, metadata, tags }`
- [x] T019 [US1] Add `startPolling(internalMatchId, cricbuzzMatchId)` to `src/adapters/cricbuzz.js` — `setInterval` using `POLL_INTERVAL_MS`, calls `fetchCommentary` → `deduplicateBall` → `normalizeBall` → `publishEvent`
- [x] T020 [US1] Create `src/websocket/registry.js` — export `subscribe(ws, matchId)`, `unsubscribe(ws, matchId)`, `getSubscribers(matchId)` using `Map<matchId, Set<WebSocket>>`; prune empty sets; maintain `ws.matchIds` back-reference
- [x] T021 [US1] Create `src/websocket/broadcaster.js` — export `broadcastToMatch(matchId, payload)` that calls `safeSend` for each subscriber; `safeSend` checks `ws.readyState === OPEN` and `ws.bufferedAmount < 16384` before sending
- [x] T022 [US1] Update `src/services/commentary.js` — after DB insert in `publishEvent()`, call `broadcastToMatch(matchId, { type: 'ball_event', timestamp, matchId, event: savedRow })`
- [x] T023 [US1] Create `src/websocket/server.js` — export `setupWebSocket(server)` that attaches to `http.Server`, on connection sets `ws.isAlive = true` and `ws.matchIds = new Set()`
- [x] T024 [US1] Wire everything into `src/index.js` — call `setupWebSocket(server)`, call `startPollingAllLiveMatches()` from the adapter on server start

**Checkpoint**: `wscat` connect → subscribe → see `ball_event` messages appear automatically. Run `npm test` — T013 and T014 pass.

---

## Phase 4: User Story 2 — Selective Match Subscription (P1)

**Goal**: Fans explicitly subscribe to a specific match and only receive events from that match. Multiple matches can run simultaneously with isolated fan groups.

**Independent Test**: Start 2 simulated matches → connect 2 `wscat` clients → subscribe each to a different match → publish event to match A → only client A receives it, client B sees nothing.

### Tests for User Story 2

> **Write these first — verify they FAIL — then implement**

- [ ] T025 [P] [US2] Write `tests/unit/registry.test.js` — test: subscribe adds ws to match set; unsubscribe removes it; empty sets are pruned; `ws.matchIds` is kept in sync
- [ ] T026 [P] [US2] Write `tests/integration/websocket.test.js` — test: send `{ type: "subscribe", matchId: 1 }` → receive `{ type: "subscribed" }`; send `{ type: "unsubscribe", matchId: 1 }` → receive `{ type: "unsubscribed" }`

### Implementation for User Story 2

- [ ] T027 [US2] Create `src/websocket/handlers.js` — export `handleMessage(ws, rawData)` that JSON-parses the message, routes by `type`, sends `{ type: "error", code: "INVALID_MESSAGE" }` on bad JSON
- [ ] T028 [US2] Add `handleSubscribe(ws, data)` to `src/websocket/handlers.js` — validates `matchId` exists in DB, calls `registry.subscribe(ws, matchId)`, sends back `{ type: "subscribed", matchId, matchStatus, seriesName, matchFormat }`
- [ ] T029 [US2] Add `handleUnsubscribe(ws, data)` to `src/websocket/handlers.js` — calls `registry.unsubscribe(ws, matchId)`, sends `{ type: "unsubscribed", matchId }`
- [ ] T030 [US2] Add `handlePing(ws)` to `src/websocket/handlers.js` — sends `{ type: "pong", timestamp }`
- [ ] T031 [US2] Wire `handleMessage` into `src/websocket/server.js` — `ws.on('message', (data) => handleMessage(ws, data))`
- [ ] T032 [US2] Create `src/routes/matches.js` — `GET /api/matches` (supports `?status=live&format=T20`), `GET /api/matches/:id`; query DB via drizzle; return match array
- [ ] T033 [US2] Create `src/routes/events.js` — `GET /api/matches/:id/events` (supports `?after=N&limit=100`); query commentary table ordered by sequence; return `{ events, total, lastSequence }`
- [ ] T034 [US2] Mount routes in `src/index.js` — replace stub with real `matchesRouter` and `eventsRouter`

**Checkpoint**: `GET /api/matches?status=live` returns match list. Two `wscat` clients subscribe to different matches — events are isolated. Run `npm test` — all tests pass.

---

## Phase 5: User Story 3 — Connection Resilience (P2)

**Goal**: Ghost connections detected within 30s. Reconnecting fans receive all balls they missed while disconnected.

**Independent Test**: Subscribe to a match → kill the network tab → wait 35s → reconnect with `lastSequence: N` → receive all missed balls before live stream resumes.

### Tests for User Story 3

> **Write these first — verify they FAIL — then implement**

- [ ] T035 [P] [US3] Write `tests/unit/heartbeat.test.js` — test: `ws.isAlive = false` + no pong → `ws.terminate()` called; `ws.isAlive = true` after pong received
- [ ] T036 [P] [US3] Write `tests/integration/events.test.js` — test: `GET /api/matches/1/events?after=5` returns only events with `sequence > 5`

### Implementation for User Story 3

- [ ] T037 [US3] Create `src/websocket/heartbeat.js` — export `startHeartbeat(wss)` that runs `setInterval` every 15000ms: for each client, if `!ws.isAlive` call `ws.terminate()`, else set `ws.isAlive = false` and call `ws.ping()`; set `ws.on('pong', () => { ws.isAlive = true })`
- [ ] T038 [US3] Wire `startHeartbeat(wss)` in `src/index.js` — call after WebSocket server setup; clear interval on `wss.on('close')`
- [ ] T039 [US3] Add connection cleanup to `src/websocket/server.js` — `ws.on('close', () => { ws.matchIds.forEach(id => registry.unsubscribe(ws, id)); ws.matchIds.clear(); })`; `ws.on('error', (err) => { console.error(err); ws.terminate(); })`
- [ ] T040 [US3] Update `src/websocket/handlers.js` `handleSubscribe` — accept `lastSequence` param; if `lastSequence > 0`, query DB for missed events using `sequence > lastSequence`, send each as `ball_event` before live stream
- [ ] T041 [US3] Update `src/routes/events.js` — ensure `?after=N` query param filters `commentary` table by `sequence > N` using the `(matchId, sequence)` composite index

**Checkpoint**: Kill `wscat` → wait 35s → reconnect → missed events arrive. `npm test` — all tests pass.

---

## Phase 6: User Story 4 — Live Scorecard Synchronization (P2)

**Goal**: When runs are scored or a wicket falls, a `score_update` message is sent alongside the `ball_event` so fans see the current score update instantly.

**Independent Test**: Subscribe to a match → a boundary ball event arrives → immediately followed by a `score_update` message showing the new total.

### Tests for User Story 4

> **Write these first — verify they FAIL — then implement**

- [ ] T042 [P] [US4] Add test to `tests/unit/cricbuzz-adapter.test.js` — test `extractScoreUpdate()`: given a ball with `runs: 4`, returns `{ runs: +4, wicketFell: false }`; given a wicket ball, returns `{ wicketFell: true }`

### Implementation for User Story 4

- [ ] T043 [US4] Add `extractScoreUpdate(rawBall)` to `src/adapters/cricbuzz.js` — reads `event` field from Cricbuzz commentary (`"BOUNDARY"`, `"WICKET"`, `"SIX"` etc.) and returns score delta
- [ ] T044 [US4] Add `fetchScore(cricbuzzMatchId)` to `src/adapters/cricbuzz.js` — calls `GET /mcenter/v1/{matchId}/score`, returns `{ runs, wickets, overs, runRate, inningsNum, battingTeam }`
- [ ] T045 [US4] Update `src/services/commentary.js` `publishEvent()` — after broadcasting `ball_event`, check if score changed, update `matches` table (`homeScore`, `awayScore`, `homeWickets`, `homeOvers`), broadcast `{ type: "score_update", matchId, score: { ... } }`
- [ ] T046 [US4] Update `src/routes/matches.js` — include `homeScore`, `homeWickets`, `homeOvers`, `awayScore`, `awayWickets`, `awayOvers` in all match responses

**Checkpoint**: Ball event arrives → `score_update` follows immediately in `wscat`. Score in `GET /api/matches/:id` reflects latest value. `npm test` — all tests pass.

---

## Phase 7: User Story 5 — High Concurrency (P2)

**Goal**: 10,000 concurrent fan connections handled without degradation, memory leaks, or missed broadcasts.

**Independent Test**: Run `tests/load/concurrent-connections.js` → connect 1,000 clients → publish 10 events → verify all 1,000 clients received all 10 events → check process memory hasn't grown unboundedly.

### Tests for User Story 5

- [ ] T047 [US5] Write `tests/load/concurrent-connections.js` — script that opens 1,000 WebSocket connections, subscribes all to match 1, publishes 10 events via internal `publishEvent()`, counts events received per client, reports pass/fail

### Implementation for User Story 5

- [ ] T048 [US5] Update `src/websocket/broadcaster.js` — confirm `bufferedAmount` check drops frames for slow consumers (already in design); add `droppedFrames` counter per match for observability
- [ ] T049 [US5] Add `maxConnections` guard to `src/websocket/server.js` — if `wss.clients.size >= MAX_CONNECTIONS` (default 10000), send `{ type: "error", code: "SERVER_FULL" }` and `ws.close()`
- [ ] T050 [US5] Confirm `pg.Pool` settings in `src/db/db.js` — `max: 20` enforced; heavy WS load must not open more DB connections than pool allows

**Checkpoint**: Load test passes. Server memory stable after test completes. `npm test` — all tests pass.

---

## Phase 8: User Story 6 — Protection Against Malicious Connections (P3)

**Goal**: ArcJet blocks bot attacks and rate-limits both REST and WebSocket upgrade attempts. Legitimate fans unaffected.

**Independent Test**: Use `ab` or `curl` loop to hit REST 60 times in 10s from same IP → requests after 50 get `429`. Try opening 6 WebSocket connections in 2s → 6th gets rejected with `429`.

### Tests for User Story 6

- [ ] T051 [P] [US6] Write `tests/integration/matches.test.js` — test: `GET /api/matches` returns 200 for normal request; mock ArcJet decision as denied → returns 429

### Implementation for User Story 6

- [ ] T052 [US6] Create `src/middleware/arcjet.js` — initialize `arcjet({ key: ARCJET_KEY, characteristics: ['ip.src'], rules: [shield(), detectBot(), slidingWindow({ interval: 10, max: 50 })] })`; export `aj` and `arcjetMiddleware` Express middleware that returns 429/403 on `isDenied()`
- [ ] T053 [US6] Add `wsAj = aj.withRule(slidingWindow({ interval: 2, max: 5 }))` to `src/middleware/arcjet.js` — stricter rule for WebSocket upgrade
- [ ] T054 [US6] Wire `arcjetMiddleware` into `src/index.js` — `app.use(arcjetMiddleware)` before all routes
- [ ] T055 [US6] Wire `wsAj` into HTTP `upgrade` event in `src/index.js` — `server.on('upgrade', async (req, socket, head) => { const d = await wsAj.protect(req); if (d.isDenied()) { socket.write('HTTP/1.1 429 ...\r\n\r\n'); socket.destroy(); return; } wss.handleUpgrade(...) })`

**Checkpoint**: REST rate limit triggers at 51st request. 6th WS connection in 2s is rejected. Legitimate fans still connect fine. `npm test` — all tests pass.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Observability, logging, and final wiring that touches multiple stories.

- [x] T056 [P] Update `src/health.js` — add `websocket.connectedClients` (from `wss.clients.size`), `cricbuzz.activePollers`, `cricbuzz.lastPollAt` to health response
- [x] T057 [P] Add structured logging to `src/adapters/cricbuzz.js` — log poll start/end, new ball detected, Cricbuzz API errors (JSON format with `level`, `message`, `matchId`, `timestamp`)
- [x] T058 [P] Add structured logging to `src/websocket/server.js` — log connect (with `connectionId`), disconnect, subscribe, unsubscribe events
- [ ] T059 Run the `quickstart.md` end-to-end validation — `npm run dev` → health check → wscat subscribe → see live events → disconnect → reconnect with `lastSequence` → confirm missed events arrive
- [x] T060 Update `README.md` (or create if missing) — add one-paragraph description of the project, link to `quickstart.md`, list environment variables

**Checkpoint**: Full end-to-end flow works. Health endpoint shows real metrics. All tests pass with `npm test`.

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1: Setup          → no dependencies, start immediately
Phase 2: Foundation     → depends on Phase 1 — BLOCKS all user stories
Phase 3: US1 (P1)       → depends on Phase 2
Phase 4: US2 (P1)       → depends on Phase 2, builds on Phase 3 registry
Phase 5: US3 (P2)       → depends on Phase 4
Phase 6: US4 (P2)       → depends on Phase 3
Phase 7: US5 (P2)       → depends on Phase 3
Phase 8: US6 (P3)       → depends on Phase 2 (Foundation)
Phase 9: Polish         → depends on all phases complete
```

### User Story Dependencies

- **US1 + US2** are both P1 — complete these before anything else. US2 builds directly on US1's registry.
- **US3** depends on US2 (needs subscribe handler to test reconnect).
- **US4** depends on US1 (needs `publishEvent` to add score_update).
- **US5** depends on US1 (needs broadcaster to test load).
- **US6** is independent — can be done after Foundation if desired.

---

## Parallel Execution Examples

### Phase 2 (Foundation) — run simultaneously

```
T007 Update src/db/db.js
T008 Create src/middleware/validate.js     ← different file, no conflict
T009 Create src/services/commentary.js    ← different file, no conflict
T011 Create src/health.js                 ← different file, no conflict
```

### Phase 3 (US1) Tests — write simultaneously

```
T013 tests/unit/cricbuzz-adapter.test.js
T014 tests/unit/commentary.test.js        ← different file, no conflict
```

### Phase 3 (US1) Implementation — run simultaneously after T019

```
T020 Create src/websocket/registry.js
T021 Create src/websocket/broadcaster.js  ← different file, no conflict
```

---

## Implementation Strategy

### MVP (Phases 1–4 only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundation — **stop here, verify health endpoint**
3. Complete Phase 3: US1 — **stop here, verify ball events appear in wscat**
4. Complete Phase 4: US2 — **stop here, verify match isolation works**
5. **Ship MVP** — fans can subscribe to a live match and see ball-by-ball events

### Incremental After MVP

5. Phase 5 (US3): Add reconnection + missed events
6. Phase 6 (US4): Add live scorecard
7. Phase 7 (US5): Harden for high concurrency
8. Phase 8 (US6): Add ArcJet protection
9. Phase 9: Polish and ship

---

## Task Count Summary

| Phase | Tasks | Story |
|-------|-------|-------|
| Phase 1: Setup | 6 | — |
| Phase 2: Foundation | 6 | — |
| Phase 3: US1 Real-Time Events | 12 | P1 🎯 |
| Phase 4: US2 Subscriptions | 10 | P1 |
| Phase 5: US3 Resilience | 7 | P2 |
| Phase 6: US4 Scorecard | 5 | P2 |
| Phase 7: US5 Concurrency | 4 | P2 |
| Phase 8: US6 Protection | 5 | P3 |
| Phase 9: Polish | 5 | — |
| **Total** | **60** | |

---

## Notes

- Work through tasks in order within each phase
- Stop at every **Checkpoint** and verify manually before continuing
- Tests marked [P] can be written simultaneously (different files)
- Each task = one file or one clear action — if a task feels too big, break it down further
- `RAPIDAPI_KEY` must never appear in any file other than `.env`
- Commit after each phase checkpoint
