# Phase 5: Connection Resilience (User Story 3 — P2)

**Tasks**: T035 – T041 | **Depends on**: Phase 4 complete (subscribe handler must exist for reconnect test to work)  
**Goal**: Ghost connections detected and terminated within 30s. Reconnecting fans receive all balls missed while offline before live stream resumes.  
**Checkpoint**: Kill `wscat` → wait 35s → reconnect with `lastSequence: N` → missed events arrive in order. `npm test` — all tests pass.

> **Write tests T035–T036 first. Run them. Confirm they FAIL. Then implement T037 onwards.**

---

## T035 — Unit Test: Heartbeat Terminates Unresponsive Connections

### Overview
Tests that the heartbeat logic correctly kills a connection that does not respond to a ping, and correctly keeps a connection that does respond.

### Files to Create / Modify
- `tests/unit/heartbeat.test.js` — new file

### Requirements
```js
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock the wss import before importing heartbeat
const mockWss = { clients: new Set(), on: jest.fn() };
jest.mock('../../src/index.js', () => ({ wss: mockWss }));

import { startHeartbeat } from '../../src/websocket/heartbeat.js';

describe('startHeartbeat', () => {
  it('terminates a client that did not pong', () => {
    const ws = { isAlive: false, terminate: jest.fn(), ping: jest.fn(), on: jest.fn() };
    mockWss.clients.add(ws);

    jest.useFakeTimers();
    startHeartbeat(mockWss);
    jest.advanceTimersByTime(15_001);

    expect(ws.terminate).toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('does not terminate a client that ponged', () => {
    const ws = { isAlive: true, terminate: jest.fn(), ping: jest.fn(), on: jest.fn() };
    mockWss.clients.add(ws);

    jest.useFakeTimers();
    startHeartbeat(mockWss);
    jest.advanceTimersByTime(15_001);

    expect(ws.terminate).not.toHaveBeenCalled();
    jest.useRealTimers();
  });
});
```

### Testing
Run `npm test` — should FAIL before T037. Expected state.

---

## T036 — Integration Test: Event Cursor Filters by Sequence

### Overview
Verifies that `GET /api/matches/:id/events?after=N` only returns events with `sequence > N`. This is the query that powers missed-event replay on reconnect.

### Files to Create / Modify
- `tests/integration/events.test.js` — new file

### Requirements
```js
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { app } from '../../src/index.js';

describe('GET /api/matches/:id/events', () => {
  it('returns only events with sequence > after param', async () => {
    // Assumes test DB has seeded events with sequences 1–10 for match 1
    const res = await request(app).get('/api/matches/1/events?after=5');
    expect(res.status).toBe(200);
    expect(res.body.events.every(e => e.sequence > 5)).toBe(true);
  });
});
```

### Key Gotchas
- This test requires `supertest` (`npm install --save-dev supertest`).
- Requires seeded test data. Use a `beforeAll` block to insert 10 test events with sequences 1–10 into the test DB, and clean up in `afterAll`.

### References
- [rest-api.md — Reconnect Recovery Example](../contracts/rest-api.md#get-apimatchesidevents)

---

## T037 — Create `src/websocket/heartbeat.js` — Ghost Connection Detector

### Overview
Runs a 15-second interval that pings every connected client. If a client does not respond with a pong before the next interval fires, it is terminated. This bounds ghost detection to ≤30 seconds (two intervals).

### Files to Create / Modify
- `src/websocket/heartbeat.js` — new file

### Requirements
```js
export function startHeartbeat(wss) {
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) {
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 15_000);

  wss.on('close', () => clearInterval(interval));
  return interval;
}
```

Each connection's pong handler sets `ws.isAlive = true` — this is registered in T039 on the connection object.

### Key Gotchas
- `ws.terminate()` not `ws.close()` — `close()` initiates a graceful 4-way handshake that may never complete on a ghost connection. `terminate()` destroys the socket immediately.
- The 15s interval means detection happens within 15–30s (depending on where in the interval cycle the connection dies). This satisfies the ≤30s requirement.
- Clear the interval on `wss.on('close')` — without this, the interval fires on a closed server during tests, causing Jest to detect open handles and warn.

### References
- [research.md — WebSocket Pub/Sub](../research.md#4-websocket-pubsub-unchanged-from-initial-research) — heartbeat pattern

---

## T038 — Wire `startHeartbeat(wss)` into `src/index.js`

### Overview
Starts the heartbeat timer once the server is listening. The returned interval ID is stored so it can be cleared on shutdown.

### Files to Create / Modify
- `src/index.js` — add heartbeat startup

### Requirements
```js
import { startHeartbeat } from './websocket/heartbeat.js';

server.on('listening', async () => {
  setupWebSocket(server);
  startHeartbeat(wss);            // add after setupWebSocket
  await startPollingAllLiveMatches();
});
```

### Key Gotchas
- `startHeartbeat` must be called after `setupWebSocket` — the `wss` must be attached to the server before its `clients` set can be iterated.

---

## T039 — Add Connection Cleanup Handlers to `src/websocket/server.js`

### Overview
When a WebSocket connection closes (gracefully or due to error), the fan must be removed from all match subscriptions and the heartbeat `pong` listener must set `ws.isAlive = true`. Without cleanup, the registry holds dead socket references that receive phantom broadcasts.

### Files to Create / Modify
- `src/websocket/server.js` — add `close` and `error` handlers inside `wss.on('connection', ...)`

### Requirements
```js
import { unsubscribe } from './registry.js';

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.matchIds = new Set();

  ws.on('message', (data) => handleMessage(ws, data));

  ws.on('pong', () => { ws.isAlive = true; });     // heartbeat response

  ws.on('close', () => {
    ws.matchIds.forEach((id) => unsubscribe(ws, id));
    ws.matchIds.clear();
  });

  ws.on('error', (err) => {
    console.error({ level: 'error', message: 'WebSocket error', err: err.message });
    ws.terminate();  // triggers 'close' event, which runs cleanup
  });
});
```

### Key Gotchas
- The `error` handler calls `ws.terminate()` which fires the `close` event — cleanup runs exactly once via the `close` handler regardless of whether the disconnect was graceful or error-caused.
- `ws.matchIds.forEach(id => unsubscribe(ws, id))` iterates the back-reference set that was maintained by `registry.subscribe`. If back-references are out of sync, some subscriptions will leak. This is why both `subscribe` and `unsubscribe` in T020 must keep `ws.matchIds` in sync.

---

## T040 — Add Missed-Event Replay to `handleSubscribe`

### Overview
When a reconnecting fan sends `lastSequence: N`, the server queries PostgreSQL for all events after that sequence and sends them one by one before the live stream begins. The fan seamlessly catches up.

### Files to Create / Modify
- `src/websocket/handlers.js` — update `handleSubscribe` function

### Requirements
```js
import { db } from '../db/db.js';
import { commentary } from '../db/schema.js';
import { eq, gt, and } from 'drizzle-orm';
import { asc } from 'drizzle-orm';

async function handleSubscribe(ws, data) {
  // ... existing match lookup and subscribe call ...

  // Replay missed events if reconnecting
  if (data.lastSequence > 0) {
    const missed = await db.select().from(commentary)
      .where(and(eq(commentary.matchId, data.matchId), gt(commentary.sequence, data.lastSequence)))
      .orderBy(asc(commentary.sequence));

    for (const event of missed) {
      send(ws, {
        type: 'ball_event',
        matchId: data.matchId,
        event,
      });
    }
  }
}
```

### Key Gotchas
- Send missed events **after** the `subscribed` confirmation but **before** any new live events can arrive. Since broadcast happens synchronously inside `publishEvent`, and the DB query above runs before control is released from the event handler, the ordering is naturally correct.
- `orderBy(asc(commentary.sequence))` is mandatory — missed events must arrive in chronological order or the fan's commentary feed will be scrambled.
- If `lastSequence` is `0` or absent (first connection, not a reconnect), skip the replay entirely.

### References
- [websocket-protocol.md — Reconnection Protocol](../contracts/websocket-protocol.md#reconnection-protocol-client-responsibility)

---

## T041 — Confirm Cursor Filtering Uses the Composite Index in `src/routes/events.js`

### Overview
Ensures the `?after=N` query in the events endpoint hits the `commentary_match_seq_idx` index rather than doing a full table scan. No code changes needed if T033 was implemented correctly — this is a verification step.

### Files to Create / Modify
- `src/routes/events.js` — review only; adjust if the `where` clause is not using both `matchId` and `sequence`

### Requirements
The query must include both columns from the composite index:
```js
.where(and(
  eq(commentary.matchId, matchId),    // ← left column of composite index
  gt(commentary.sequence, after),     // ← right column
))
```

### Testing
In Neon Studio (or `psql`), run:
```sql
EXPLAIN ANALYZE
SELECT * FROM commentary
WHERE match_id = 1 AND sequence > 35
ORDER BY sequence ASC
LIMIT 100;
```
Confirm the output shows `Index Scan using commentary_match_seq_idx` — not `Seq Scan`.

### Key Gotchas
- A query using only `matchId` without `sequence` would still use the index (leading column), but less efficiently. Always include both for the reconnect query.
