# Quickstart: Live Cricket Commentary Platform

**Updated**: 2026-04-13
**Audience**: Developer setting up the project for the first time.

---

## Prerequisites

- Node.js v20+ (`node --version`)
- A Neon account with a PostgreSQL database provisioned
- A RapidAPI account (free) with Cricbuzz Cricket API subscribed
- An ArcJet account with an API key

---

## 1. Get Your Cricbuzz API Key (RapidAPI)

1. Go to [rapidapi.com](https://rapidapi.com) and create a free account
2. Search for **"Cricbuzz Cricket"** → select the API by `cricketapilive`
3. Click **Subscribe to Test** — choose the free plan (500,000 req/month)
4. Copy your `X-RapidAPI-Key` from the playground header
5. This is your `RAPIDAPI_KEY`

---

## 2. Install Dependencies

```bash
npm install ws @arcjet/node zod
npm install --save-dev jest @jest/globals
```

Full dependency list after install:
```
express, ws, drizzle-orm, pg, dotenv, zod, @arcjet/node
```

---

## 3. Environment Configuration

Create `.env` in the project root (never commit this file):

```bash
# Neon PostgreSQL — use the POOLER endpoint (not direct)
DATABASE_URL=postgresql://user:password@ep-xxx.pooler.neon.tech/sportz?sslmode=require

# Cricbuzz via RapidAPI — NEVER expose this to the browser
RAPIDAPI_KEY=your_rapidapi_key_here

# ArcJet
ARCJET_KEY=ajkey_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ARCJET_ENV=development   # remove in production

# Server
PORT=8000

# Polling interval in milliseconds (15000 = 15s, 30000 = 30s)
POLL_INTERVAL_MS=15000
```

---

## 4. Update the Database Schema

Add cricket-specific columns and indexes to `src/db/schema.js` (see `data-model.md`), then run:

```bash
npm run db:generate   # generates SQL migration files in drizzle/
npm run db:migrate    # applies to Neon
npm run db:studio     # verify schema at https://local.drizzle.studio
```

---

## 5. Start the Development Server

```bash
npm run dev
# Server running at http://localhost:8000
```

---

## 6. Verify the Cricbuzz Adapter is Working

Check the health endpoint — it shows active pollers:

```bash
curl http://localhost:8000/health
```

Expected when matches are live:
```json
{
  "status": "ok",
  "cricbuzz": {
    "activePollers": 3,
    "lastPollAt": "2026-04-13T10:29:58.000Z"
  }
}
```

If no matches are live right now, `activePollers` will be `0` — this is normal.

---

## 7. Test With a Live Match

### Step 1 — Find a live match

```bash
curl http://localhost:8000/api/matches?status=live
```

If a match is live you'll see it. If not, seed a test match (see Step 8).

### Step 2 — Connect via WebSocket

```bash
npm install -g wscat
wscat -c ws://localhost:8000/ws
```

Subscribe to match ID 1:
```json
{"type":"subscribe","timestamp":"2026-04-13T10:00:00.000Z","matchId":1,"lastSequence":0}
```

Expected:
```json
{"type":"subscribed","matchId":1,"matchStatus":"live","seriesName":"IPL 2026","matchFormat":"T20"}
```

### Step 3 — Watch ball events arrive

Every time the Cricbuzz adapter detects a new ball (every 15–30s during a live match), the `wscat` terminal will show:
```json
{
  "type": "ball_event",
  "matchId": 1,
  "event": {
    "sequence": 48,
    "eventType": "boundary_four",
    "actor": "V Kohli",
    "message": "FOUR! Kohli drives through covers.",
    "metadata": { "over": "16.1", "runs": 4, "bowler": "J Bumrah" }
  }
}
```

---

## 8. Seed a Test Match (No Live Match Available)

When no IPL/international match is live, use this script to seed a match and simulate ball events from historical data:

```bash
node src/adapters/cricbuzz.js --seed   # seeds a test match from historical data
```

Or manually insert via Drizzle Studio (`npm run db:studio`).

---

## 9. Run Tests

```bash
npm test
```

Test suite covers:
- **Unit**: Cricbuzz adapter deduplication, subscription registry, heartbeat, broadcaster
- **Integration**: WebSocket subscribe/unsubscribe, missed events on reconnect, REST endpoints

---

## Project Structure Reference

```
src/
├── index.js                 # Entry: http.Server + Express + WebSocketServer
├── health.js                # GET /health
├── db/
│   ├── db.js                # pg.Pool + drizzle instance
│   └── schema.js            # matches + commentary tables
├── adapters/
│   └── cricbuzz.js          # Polls Cricbuzz every 15–30s → publishEvent()
├── websocket/
│   ├── server.js            # WebSocketServer (noServer: true)
│   ├── handlers.js          # Message router: subscribe/unsubscribe/ping
│   ├── registry.js          # Map<matchId, Set<WebSocket>>
│   ├── heartbeat.js         # 15s ping/pong, ghost detection
│   └── broadcaster.js       # broadcastToMatch() + backpressure
├── routes/
│   ├── matches.js           # GET /api/matches, GET /api/matches/:id
│   └── events.js            # GET /api/matches/:id/events
├── middleware/
│   ├── arcjet.js            # ArcJet singleton
│   └── validate.js          # Zod validation wrapper
└── services/
    └── commentary.js        # publishEvent(): DB write → broadcast
```

---

## Common Issues

**`activePollers: 0` always** — No live matches right now. IPL and international matches are seasonal. Use the seed script for development.

**`429 Too Many Requests` from Cricbuzz** — Polling interval too aggressive. Increase `POLL_INTERVAL_MS` to `30000` (30s).

**WebSocket connects but no events** — Check that the adapter detected a live match. Check `GET /api/matches?status=live`.

**`ECONNREFUSED` on database** — `DATABASE_URL` must point to Neon pooler endpoint. Ensure `?sslmode=require` is appended.

**`ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING` in Jest** — Add `node --experimental-vm-modules` prefix. Verify `npm test` script in `package.json`.

**Ghost connections accumulating** — Confirm `startHeartbeat(wss)` is called in `src/index.js` after server starts.
