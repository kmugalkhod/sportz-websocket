# Phase 9: Observability & Production Polish

**Tasks**: T056 – T060 | **Depends on**: All prior phases complete  
**Purpose**: Replace stub metrics with real data, add structured logging throughout the hot path, and validate the full end-to-end flow from first connection to reconnect.  
**Checkpoint**: Full E2E flow works. Health endpoint returns live metrics. All tests pass with `npm test`.

---

## T056 — Enrich `src/health.js` with Live Runtime Metrics

### Overview
Replaces the placeholder zeroes in the health response with real values pulled from the WebSocket server, Cricbuzz adapter, and database pool. Monitoring tools (Site24x7) rely on this endpoint to page on-call when the service degrades.

### Files to Create / Modify
- `src/health.js` — update handler to import live values

### Requirements
```js
import { wss } from './index.js';
import { getActivePollerCount, getLastPollAt } from './adapters/cricbuzz.js';
import { pool } from './db/db.js';

healthRouter.get('/health', async (req, res) => {
  let dbStatus = 'ok';
  try {
    await pool.query('SELECT 1');
  } catch {
    dbStatus = 'error';
  }

  res.status(dbStatus === 'error' ? 503 : 200).json({
    status: dbStatus === 'error' ? 'degraded' : 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    websocket: {
      connectedClients: wss.clients.size,
    },
    database: {
      status: dbStatus,
      poolSize: pool.totalCount,
      idleConnections: pool.idleCount,
    },
    cricbuzz: {
      activePollers: getActivePollerCount(),
      lastPollAt: getLastPollAt(),
    },
  });
});
```

Export two helpers from `src/adapters/cricbuzz.js`:
```js
export function getActivePollerCount() { return activePollers.size; }
export function getLastPollAt() { return lastPollTimestamp; }
```

Update the poll loop to set `lastPollTimestamp = new Date().toISOString()` after each successful poll.

### Key Gotchas
- `pool.query('SELECT 1')` is a lightweight liveness check — it verifies the DB is reachable, not just that the pool object exists.
- Return `503` when DB is unreachable so uptime monitors can distinguish between "process is down" and "DB is down".
- `pool.totalCount` and `pool.idleCount` are `pg.Pool` public properties — no extra instrumentation needed.

### References
- [rest-api.md — GET /health](../contracts/rest-api.md#get-health) — full expected response shape

---

## T057 — Add Structured JSON Logging to `src/adapters/cricbuzz.js`

### Overview
The Cricbuzz adapter runs continuously in the background and its errors are invisible without logging. Structured JSON logs enable log aggregation tools (Datadog, Papertrail) to filter and alert on specific events.

### Files to Create / Modify
- `src/adapters/cricbuzz.js` — add log calls at key points

### Requirements
Add log lines in the following locations:

```js
// Poll start
console.log(JSON.stringify({ level: 'info', message: 'poll_start', matchId, timestamp: new Date().toISOString() }));

// New ball detected
console.log(JSON.stringify({ level: 'info', message: 'new_ball', matchId, ballKey, timestamp: new Date().toISOString() }));

// Poll error
console.error(JSON.stringify({ level: 'error', message: 'poll_failed', matchId, error: err.message, timestamp: new Date().toISOString() }));

// Cricbuzz API non-200
console.error(JSON.stringify({ level: 'error', message: 'cricbuzz_api_error', status: res.status, endpoint, timestamp: new Date().toISOString() }));
```

### Key Gotchas
- Do NOT log `RAPIDAPI_KEY` — not even partially. Ensure the headers object is never passed to a log statement.
- Log `poll_start` at `info` level, not `debug` — production log levels are typically `info` and above, and the poll heartbeat at `info` provides useful operational evidence that the poller is running.
- Use `console.error` for errors so they appear on stderr — useful when running on Hostinger where stdout and stderr may be routed to different log streams.

---

## T058 — Add Structured JSON Logging to `src/websocket/server.js`

### Overview
Connection lifecycle events provide the audit trail needed to debug fan disconnects, subscription storms, and ghost-connection issues in production.

### Files to Create / Modify
- `src/websocket/server.js` — add log calls in connection, close, and error handlers

### Requirements
```js
import { randomUUID } from 'crypto';

wss.on('connection', (ws, req) => {
  ws.connectionId = randomUUID();
  ws.connectedAt = Date.now();
  ws.isAlive = true;
  ws.matchIds = new Set();

  console.log(JSON.stringify({
    level: 'info', message: 'ws_connect',
    connectionId: ws.connectionId,
    ip: req.socket.remoteAddress,
    timestamp: new Date().toISOString(),
  }));

  ws.on('close', () => {
    console.log(JSON.stringify({
      level: 'info', message: 'ws_disconnect',
      connectionId: ws.connectionId,
      durationMs: Date.now() - ws.connectedAt,
      subscriptions: [...ws.matchIds],
      timestamp: new Date().toISOString(),
    }));
    ws.matchIds.forEach((id) => unsubscribe(ws, id));
    ws.matchIds.clear();
  });
});
```

Also log in `handleSubscribe` and `handleUnsubscribe`:
```js
console.log(JSON.stringify({ level: 'info', message: 'ws_subscribe', connectionId: ws.connectionId, matchId, timestamp: new Date().toISOString() }));
```

### Key Gotchas
- `randomUUID()` from `node:crypto` is available in Node.js v15.6+ — no additional package needed.
- Log `req.socket.remoteAddress` for the IP — this is the raw socket IP. If behind a proxy (Nginx, Cloudflare), use `req.headers['x-forwarded-for']` instead.
- `durationMs` on disconnect tells you how long each fan stayed connected — useful for understanding audience behaviour.

---

## T059 — Run the `quickstart.md` End-to-End Validation

### Overview
A manual smoke test that exercises the complete fan journey: server start → health check → WebSocket subscribe → live event delivery → disconnect → reconnect with cursor → missed events arrive.

### Requirements
Follow the steps in [quickstart.md](../quickstart.md) exactly:

1. `npm run dev` — server starts on port 8000
2. `curl http://localhost:8000/health` — returns `{ "status": "ok" }` with real `connectedClients` and `activePollers`
3. `wscat -c ws://localhost:8000/ws` — connects successfully
4. Send `{ "type": "subscribe", "matchId": 1, "lastSequence": 0 }` — receive `{ "type": "subscribed" }`
5. Wait for a `ball_event` — should arrive within `POLL_INTERVAL_MS`
6. Note the `event.sequence` from the last received `ball_event`
7. Disconnect `wscat` (Ctrl+C)
8. Wait 10 seconds (let 1–2 new balls arrive)
9. Reconnect: `wscat -c ws://localhost:8000/ws`
10. Send `{ "type": "subscribe", "matchId": 1, "lastSequence": <noted sequence> }`
11. Verify: missed `ball_event` messages arrive in sequence order before live stream resumes

### Testing
All steps must pass manually before marking the phase complete. If Step 11 fails (no missed events), check:
- `handleSubscribe` is sending missed events before the `subscribed` confirmation (order issue)
- The `commentary_match_seq_idx` index exists (run T006 verification again)
- `lastSequence` is being parsed as an integer, not a string

---

## T060 — Create or Update `README.md` with Project Overview

### Overview
The README is the first thing a new contributor or evaluator reads. It should explain what the project does, how to run it, and where to find detailed documentation — nothing more.

### Files to Create / Modify
- `README.md` — create at project root if absent, or update existing

### Requirements
Include:
1. **One-paragraph description** — what the platform does, the tech stack, the data flow (Cricbuzz → Node.js → WebSocket → fans)
2. **Quick start** — link to [quickstart.md](specs/001-live-sports-commentary-platform/quickstart.md)
3. **Environment variables table** — list all six variables with one-line descriptions

```markdown
| Variable | Required | Description |
|----------|----------|-------------|
| DATABASE_URL | Yes | Neon pooler connection string |
| RAPIDAPI_KEY | Yes | Cricbuzz via RapidAPI — server-side only |
| ARCJET_KEY | Yes | ArcJet rate limiting key |
| ARCJET_ENV | Dev only | Set to `development` to disable ArcJet blocking locally |
| PORT | No | Default: 8000 |
| POLL_INTERVAL_MS | No | Default: 15000 (15s) |
```

### Key Gotchas
- Do NOT include any key values or `.env` contents in the README.
- Do NOT document internal implementation details (registry, broadcaster, heartbeat) — those belong in the spec. The README is for operators and contributors, not for understanding the architecture.
