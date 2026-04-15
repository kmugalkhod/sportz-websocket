# Phase 2: Core Infrastructure

**Tasks**: T007 – T012 | **Blocks**: All user story phases. Do NOT start Phase 3 until this checkpoint passes.  
**Checkpoint**: `npm run dev` starts without errors. `curl http://localhost:8000/health` returns `{ "status": "ok" }`.

---

## T007 — Harden `src/db/db.js` with Production Pool Settings

### Overview
The existing `db.js` likely uses a bare `pg.Pool` without tuning. Under WebSocket load, an untuned pool either opens too many connections (exceeds Neon's limit) or times out under concurrent queries. This task locks in the correct pool config before any other module imports it.

### Files to Create / Modify
- `src/db/db.js` — update `pg.Pool` config; export both `pool` and `db`

### Requirements
```js
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export const db = drizzle(pool, { schema });
```

### Environment Variables
- `DATABASE_URL` — must be the Neon **pooler** endpoint with `?sslmode=require`

### Key Gotchas
- `max: 20` matches Neon's free tier connection limit. Do not raise it — every WebSocket connection that triggers a DB query shares this pool.
- `connectionTimeoutMillis: 5000` prevents a single slow connection from hanging the server indefinitely. Without it, a Neon cold-start can block the event loop.
- Export both `pool` and `db`. The `pool` export is needed by the health endpoint to inspect idle connection count.

---

## T008 — Create `src/middleware/validate.js` — Zod Request Validator

### Overview
A reusable Express middleware factory that validates `req.body` against a Zod schema before the route handler runs. Keeps validation logic out of route files entirely.

### Files to Create / Modify
- `src/middleware/validate.js` — new file

### Requirements
```js
export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        issues: result.error.issues,
      });
    }
    req.body = result.data;  // replace with parsed (coerced) data
    next();
  };
}
```

### Key Gotchas
- `safeParse` does not throw — it returns `{ success, data, error }`. Never use `parse()` in middleware, as it throws and would require a try/catch to avoid crashing the server.
- Reassigning `req.body = result.data` passes coerced data (e.g., string `"42"` coerced to number `42`) to the route handler — important for `matchId` params from JSON bodies.

### Testing
No automated test in this phase. Verified indirectly when routes are exercised in Phase 4.

---

## T009 — Create `src/services/commentary.js` — Event Persistence Stub

### Overview
`publishEvent()` is the single write path for all ball events. In this phase it only does the DB insert and returns the saved row. The broadcast call is added in Phase 3 (T022) once the broadcaster exists.

### Files to Create / Modify
- `src/services/commentary.js` — new file

### Requirements
```js
import { db } from '../db/db.js';
import { commentary } from '../db/schema.js';

export async function publishEvent(matchId, eventData) {
  const [saved] = await db
    .insert(commentary)
    .values({ matchId, ...eventData })
    .returning();
  return saved;
  // broadcastToMatch() wired in T022
}
```

### Key Gotchas
- `.returning()` is required — the saved row contains the auto-assigned `sequence` and `id` that must be included in the broadcast payload.
- Do NOT wrap the insert in a transaction. Broadcast must happen after the commit — a transaction that hasn't committed yet would allow a race where a client receives a broadcast for data that can't be queried.

### References
- [plan.md — Publish Flow](../plan.md#publish-flow-write-then-broadcast) — the write-then-broadcast pattern

---

## T010 — Create `src/index.js` — Unified HTTP + WebSocket Server

### Overview
The entry point that wires Express and the WebSocket server onto a single `http.Server` instance. Using `noServer: true` on the WebSocket server is mandatory — it allows ArcJet to intercept the upgrade event before the connection is accepted.

### Files to Create / Modify
- `src/index.js` — new file

### Requirements
```js
import http from 'http';
import express from 'express';
import { WebSocketServer } from 'ws';

const app = express();
export const server = http.createServer(app);
export const wss = new WebSocketServer({ noServer: true });

server.listen(process.env.PORT ?? 8000, () => {
  console.log(`Listening on port ${process.env.PORT ?? 8000}`);
});
```

### Key Gotchas
- `noServer: true` is non-negotiable. Without it, the `ws` library handles the HTTP upgrade internally and ArcJet never sees the connection attempt — rate limiting for WebSocket upgrades becomes impossible.
- Export both `server` and `wss` so other modules (heartbeat, WebSocket setup) can import them without circular dependencies.
- Do not call `setupWebSocket()` or `startPolling()` here yet — those are wired in T024 after all their dependencies exist.

### References
- [research.md — ArcJet Rate Limiting](../research.md#6-arcjet-rate-limiting-unchanged-from-initial-research)

---

## T011 — Create `src/health.js` — Health Check Endpoint

### Overview
A lightweight `/health` route that monitoring tools (Site24x7, uptime checkers) can poll. In this phase it returns static placeholder values for WebSocket and DB metrics — real values are wired in Phase 9 (T056).

### Files to Create / Modify
- `src/health.js` — new file

### Requirements
```js
import { Router } from 'express';
export const healthRouter = Router();

healthRouter.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    websocket: { connectedClients: 0 },       // real value wired in T056
    database: { status: 'ok' },               // real check wired in T056
  });
});
```

### Testing
```bash
curl http://localhost:8000/health
# Expected: { "status": "ok", "timestamp": "...", "uptime": ..., ... }
```

### References
- [rest-api.md — GET /health](../contracts/rest-api.md) — full response shape including Phase 9 metrics

---

## T012 — Wire Foundation Modules into `src/index.js`

### Overview
Connects the foundation pieces: JSON body parsing, the health route, and stub routes for the match and events APIs. The stubs return 404 for now so the URL structure is established before real handlers exist.

### Files to Create / Modify
- `src/index.js` — add middleware and route mounts

### Requirements
```js
import { healthRouter } from './health.js';

app.use(express.json());
app.use(healthRouter);

// Stubs — replaced with real routers in T034
app.use('/api/matches', (req, res) => res.status(404).json({ error: 'Not implemented yet' }));
app.use('/api/matches/:id/events', (req, res) => res.status(404).json({ error: 'Not implemented yet' }));
```

### Key Gotchas
- `express.json()` must be mounted before any route that reads `req.body`. Mounting it after a route silently breaks body parsing for that route.
- `dotenv` must be initialized before any `process.env` is read. Add `import 'dotenv/config'` as the very first import in `src/index.js`.

### Testing
```bash
npm run dev
curl http://localhost:8000/health         # → { "status": "ok" }
curl http://localhost:8000/api/matches    # → { "error": "Not implemented yet" }
```
