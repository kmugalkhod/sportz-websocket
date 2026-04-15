# Phase 4: Match Subscription & Routing (User Story 2 — P1)

**Tasks**: T025 – T034 | **Depends on**: Phase 2 complete; Phase 3 registry (T020) exists  
**Goal**: Fans subscribe to a specific match via WebSocket message and only receive events for that match. REST endpoints let fans discover matches and fetch history.  
**Checkpoint**: `GET /api/matches?status=live` returns match list. Two `wscat` clients subscribed to different matches see isolated events. `npm test` — all tests pass.

> **Write tests T025–T026 first. Run them. Confirm they FAIL. Then implement T027 onwards.**

---

## T025 — Unit Test: Registry Subscribe / Unsubscribe Lifecycle

### Overview
The registry is the sole source of truth for who is subscribed to what. These tests lock in the invariants before the handlers use it.

### Files to Create / Modify
- `tests/unit/registry.test.js` — new file

### Requirements
```js
import { describe, it, expect, beforeEach } from '@jest/globals';
import { subscribe, unsubscribe, getSubscribers } from '../../src/websocket/registry.js';

function mockWs() {
  return { matchIds: new Set(), readyState: 1 };
}

describe('registry', () => {
  it('subscribe adds ws to the match set', () => {
    const ws = mockWs();
    subscribe(ws, 1);
    expect(getSubscribers(1).has(ws)).toBe(true);
  });

  it('unsubscribe removes ws from the match set', () => {
    const ws = mockWs();
    subscribe(ws, 2);
    unsubscribe(ws, 2);
    expect(getSubscribers(2).has(ws)).toBe(false);
  });

  it('prunes empty sets after last unsubscribe', () => {
    const ws = mockWs();
    subscribe(ws, 3);
    unsubscribe(ws, 3);
    // Internal registry should not hold an empty Set for matchId 3
    expect(getSubscribers(3).size).toBe(0);
  });

  it('keeps ws.matchIds in sync on subscribe and unsubscribe', () => {
    const ws = mockWs();
    subscribe(ws, 4);
    expect(ws.matchIds.has(4)).toBe(true);
    unsubscribe(ws, 4);
    expect(ws.matchIds.has(4)).toBe(false);
  });
});
```

### Testing
Run `npm test` — should FAIL before T020 is implemented. Passes after T020.

---

## T026 — Integration Test: WebSocket Subscribe / Unsubscribe Message Protocol

### Overview
Tests the full subscribe → response and unsubscribe → response message exchange over a real WebSocket connection to the test server.

### Files to Create / Modify
- `tests/integration/websocket.test.js` — new file

### Requirements
```js
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import WebSocket from 'ws';
import { server } from '../../src/index.js';

let ws;
beforeAll((done) => {
  server.listen(0, () => {
    const { port } = server.address();
    ws = new WebSocket(`ws://localhost:${port}/ws`);
    ws.on('open', done);
  });
});
afterAll(() => { ws.close(); server.close(); });

it('subscribe message returns subscribed confirmation', (done) => {
  ws.send(JSON.stringify({ type: 'subscribe', matchId: 1, timestamp: new Date().toISOString() }));
  ws.once('message', (data) => {
    const msg = JSON.parse(data);
    expect(msg.type).toBe('subscribed');
    expect(msg.matchId).toBe(1);
    done();
  });
});

it('unsubscribe message returns unsubscribed confirmation', (done) => {
  ws.send(JSON.stringify({ type: 'unsubscribe', matchId: 1, timestamp: new Date().toISOString() }));
  ws.once('message', (data) => {
    const msg = JSON.parse(data);
    expect(msg.type).toBe('unsubscribed');
    done();
  });
});
```

### Key Gotchas
- Use `server.listen(0)` (port 0) to let the OS assign a free port — avoids port conflicts when running tests in CI or alongside a running dev server.
- The `beforeAll` / `afterAll` must properly close the server and WebSocket or Jest will hang waiting for open handles.

### References
- [websocket-protocol.md — subscribe](../contracts/websocket-protocol.md#subscribe)
- [websocket-protocol.md — unsubscribed](../contracts/websocket-protocol.md#unsubscribed)

---

## T027 — Create `src/websocket/handlers.js` — Incoming Message Router

### Overview
Parses raw incoming WebSocket frames and dispatches to the correct handler by `type`. Invalid JSON and missing `type` are handled here — individual handlers never need to re-validate the envelope.

### Files to Create / Modify
- `src/websocket/handlers.js` — new file

### Requirements
```js
export function handleMessage(ws, rawData) {
  let msg;
  try {
    msg = JSON.parse(rawData.toString());
  } catch {
    return send(ws, { type: 'error', code: 'INVALID_MESSAGE', message: 'Bad JSON' });
  }

  if (!msg.type) {
    return send(ws, { type: 'error', code: 'INVALID_MESSAGE', message: 'Missing type field' });
  }

  switch (msg.type) {
    case 'subscribe':   return handleSubscribe(ws, msg);
    case 'unsubscribe': return handleUnsubscribe(ws, msg);
    case 'ping':        return handlePing(ws);
    default:
      return send(ws, { type: 'error', code: 'UNKNOWN_TYPE', message: `Unknown type: ${msg.type}` });
  }
}

function send(ws, payload) {
  ws.send(JSON.stringify({ timestamp: new Date().toISOString(), ...payload }));
}
```

### Key Gotchas
- `rawData.toString()` is required — the `ws` library delivers data as a `Buffer`, not a string. Calling `JSON.parse(buffer)` directly will fail.

### References
- [websocket-protocol.md — Error Codes](../contracts/websocket-protocol.md#error) — `INVALID_MESSAGE`, `UNKNOWN_TYPE`

---

## T028 — Add `handleSubscribe(ws, data)` to the Message Router

### Overview
Validates the requested `matchId` exists in the database, registers the WebSocket, and sends back the match context. If `lastSequence` is provided, missed events are replayed (full implementation in Phase 5, T040).

### Files to Create / Modify
- `src/websocket/handlers.js` — add function

### Requirements
```js
import { db } from '../db/db.js';
import { matches } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { subscribe } from './registry.js';

async function handleSubscribe(ws, data) {
  const match = await db.query.matches.findFirst({ where: eq(matches.id, data.matchId) });

  if (!match) {
    return send(ws, { type: 'error', code: 'MATCH_NOT_FOUND', message: `Match ${data.matchId} does not exist` });
  }

  subscribe(ws, data.matchId);

  send(ws, {
    type: 'subscribed',
    matchId: data.matchId,
    matchStatus: match.status,
    seriesName: match.seriesName,
    matchFormat: match.matchFormat,
  });
}
```

### Key Gotchas
- Validate against the DB, not the polling registry. A match can exist in the DB but not be actively polled (e.g., `status = 'scheduled'`). The subscription should still succeed — the fan will receive events when the match goes live.
- `MATCH_FINISHED` error code: optionally send this when `match.status === 'finished'` so the client knows not to wait for live events.

### References
- [websocket-protocol.md — subscribed](../contracts/websocket-protocol.md#subscribed) — response shape
- [websocket-protocol.md — Error Codes](../contracts/websocket-protocol.md#error)

---

## T029 — Add `handleUnsubscribe(ws, data)` to the Message Router

### Overview
Removes the fan from the match's subscriber set and confirms the action.

### Files to Create / Modify
- `src/websocket/handlers.js` — add function

### Requirements
```js
import { unsubscribe } from './registry.js';

function handleUnsubscribe(ws, data) {
  unsubscribe(ws, data.matchId);
  send(ws, { type: 'unsubscribed', matchId: data.matchId });
}
```

### Key Gotchas
- Calling `unsubscribe` for a `matchId` the fan was never subscribed to is a no-op — the registry handles the missing-key case gracefully.

---

## T030 — Add `handlePing(ws)` to the Message Router

### Overview
Application-layer ping/pong, separate from the WebSocket protocol-level heartbeat. Used by clients that want to verify message delivery, not just connection liveness.

### Files to Create / Modify
- `src/websocket/handlers.js` — add function

### Requirements
```js
function handlePing(ws) {
  send(ws, { type: 'pong' });
}
```

### References
- [websocket-protocol.md — ping / pong](../contracts/websocket-protocol.md#ping) — distinction from WS protocol pings

---

## T031 — Wire `handleMessage` into `src/websocket/server.js`

### Overview
Connects the message router to the connection handler so that incoming frames are processed.

### Files to Create / Modify
- `src/websocket/server.js` — add `ws.on('message', ...)` inside `wss.on('connection', ...)`

### Requirements
```js
import { handleMessage } from './handlers.js';

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.matchIds = new Set();
  ws.on('message', (data) => handleMessage(ws, data));
});
```

### Key Gotchas
- The `message` listener is added per connection — not once on `wss`. Each new connection gets its own listener instance bound to its own `ws` reference.

---

## T032 — Create `src/routes/matches.js` — Match List and Detail Endpoints

### Overview
REST endpoints for discovering matches. Supports status and format filters so clients can find live matches without needing to know match IDs in advance.

### Files to Create / Modify
- `src/routes/matches.js` — new file

### Requirements
```js
import { Router } from 'express';
import { db } from '../db/db.js';
import { matches } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

export const matchesRouter = Router();

matchesRouter.get('/', async (req, res) => {
  const conditions = [];
  if (req.query.status) conditions.push(eq(matches.status, req.query.status));
  if (req.query.format) conditions.push(eq(matches.matchFormat, req.query.format));

  const rows = await db.select().from(matches)
    .where(conditions.length ? and(...conditions) : undefined);

  res.json({ matches: rows });
});

matchesRouter.get('/:id', async (req, res) => {
  const match = await db.query.matches.findFirst({
    where: eq(matches.id, parseInt(req.params.id, 10)),
  });
  if (!match) return res.status(404).json({ error: 'Match not found' });
  res.json(match);
});
```

### Key Gotchas
- Parse `req.params.id` to integer with `parseInt(..., 10)`. Route params are always strings — passing a string to drizzle's `eq()` against an integer column will silently return no rows in some DB drivers.

### References
- [rest-api.md — GET /api/matches](../contracts/rest-api.md#get-apimatches) — query params and response shape

---

## T033 — Create `src/routes/events.js` — Paginated Event History Endpoint

### Overview
Returns ball-by-ball history for a match. The `?after=N` cursor parameter is what the reconnect flow (Phase 5) uses to fetch missed events.

### Files to Create / Modify
- `src/routes/events.js` — new file

### Requirements
```js
import { Router } from 'express';
import { db } from '../db/db.js';
import { commentary } from '../db/schema.js';
import { eq, gt, and } from 'drizzle-orm';
import { asc } from 'drizzle-orm';

export const eventsRouter = Router({ mergeParams: true });

eventsRouter.get('/', async (req, res) => {
  const matchId = parseInt(req.params.id, 10);
  const after = req.query.after ? parseInt(req.query.after, 10) : null;
  const limit = Math.min(parseInt(req.query.limit ?? '100', 10), 500);

  const conditions = [eq(commentary.matchId, matchId)];
  if (after !== null) conditions.push(gt(commentary.sequence, after));

  const events = await db.select().from(commentary)
    .where(and(...conditions))
    .orderBy(asc(commentary.sequence))
    .limit(limit);

  res.json({ events, total: events.length, lastSequence: events.at(-1)?.sequence ?? 0 });
});
```

### Key Gotchas
- `orderBy(asc(commentary.sequence))` is mandatory — without it, the order is undefined and a reconnecting fan would receive missed events in random order.
- The `commentary_match_seq_idx` index (created in T005) covers `(matchId, sequence)` — this query hits that index directly. Verify with `EXPLAIN ANALYZE` if performance is a concern.
- Cap `limit` at 500. A fan that was offline for an entire match innings could request thousands of rows in one call.

### References
- [rest-api.md — GET /api/matches/:id/events](../contracts/rest-api.md#get-apimatchesidevents) — response shape and cursor example

---

## T034 — Mount Real Routes in `src/index.js`

### Overview
Replaces the 404 stub routes added in T012 with the real routers.

### Files to Create / Modify
- `src/index.js` — replace stubs with real imports and mounts

### Requirements
```js
import { matchesRouter } from './routes/matches.js';
import { eventsRouter } from './routes/events.js';

// Replace the stubs from T012:
app.use('/api/matches', matchesRouter);
app.use('/api/matches/:id/events', eventsRouter);
```

### Key Gotchas
- Express processes middleware in registration order. The ArcJet middleware (added in Phase 8, T054) must be registered **before** these routes. Keep a `// ArcJet middleware goes here` comment as a placeholder.
- `mergeParams: true` must be set on `eventsRouter` (done in T033) so that `req.params.id` from the parent `/api/matches/:id` path segment is available inside the events router.
