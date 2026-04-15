# Phase 7: High-Concurrency Hardening (User Story 5 — P2)

**Tasks**: T047 – T050 | **Depends on**: Phase 3 complete (`publishEvent` and broadcaster exist)  
**Goal**: 10,000 simultaneous fan connections handled without degradation, memory leaks, or missed broadcasts. DB pool not exhausted by WebSocket load.  
**Checkpoint**: Load test passes. Server memory stable after test. `npm test` — all tests pass.

---

## [x] T047 — Write `tests/load/concurrent-connections.js` — 1,000-Client Load Test

### Overview
A standalone script (not part of the Jest suite) that verifies the broadcaster can handle a large number of concurrent connections and that all clients receive all events. Run manually before shipping.

### Files to Create / Modify
- `tests/load/concurrent-connections.js` — new file

### Requirements
```js
import WebSocket from 'ws';
import { publishEvent } from '../../src/services/commentary.js';

const CLIENTS = 1_000;
const EVENTS = 10;
const MATCH_ID = 1;

const received = new Array(CLIENTS).fill(0);
const clients = [];

// Open all connections
for (let i = 0; i < CLIENTS; i++) {
  const ws = new WebSocket('ws://localhost:8000/ws');
  ws.on('open', () => {
    ws.send(JSON.stringify({ type: 'subscribe', matchId: MATCH_ID }));
  });
  ws.on('message', (data) => {
    const msg = JSON.parse(data);
    if (msg.type === 'ball_event') received[i]++;
  });
  clients.push(ws);
}

// Wait for all connections to open, then publish events
await new Promise(r => setTimeout(r, 2000));

for (let e = 0; e < EVENTS; e++) {
  await publishEvent(MATCH_ID, { message: `Test ball ${e}`, eventType: 'ball', sequence: e });
  await new Promise(r => setTimeout(r, 100));
}

await new Promise(r => setTimeout(r, 2000));
clients.forEach(ws => ws.close());

const allReceived = received.every(count => count === EVENTS);
console.log(allReceived ? 'PASS — all clients received all events' : `FAIL — ${received.filter(c => c < EVENTS).length} clients missed events`);
process.exit(allReceived ? 0 : 1);
```

### Key Gotchas
- This script requires the server to be running separately (`npm run dev`) before executing it.
- At 1,000 clients, OS file descriptor limits may be hit. On macOS run `ulimit -n 10000` before executing the test.
- Clients that fail the `bufferedAmount` check in `safeSend` will miss events — this is expected and by design. The test reveals the true drop rate under load.

---

## [x] T048 — Harden `src/websocket/broadcaster.js` with Dropped-Frame Counter

### Overview
The backpressure guard that drops frames for slow consumers is already in place (T021). This task adds a per-match `droppedFrames` counter for observability — without it there is no way to know how many events are being silently dropped in production.

### Files to Create / Modify
- `src/websocket/broadcaster.js` — add counter Map and increment logic

### Requirements
```js
const droppedFrames = new Map(); // Map<matchId, number>

export function broadcastToMatch(matchId, payload) {
  const data = JSON.stringify(payload);
  for (const ws of getSubscribers(matchId)) {
    if (!safeSend(ws, data)) {
      droppedFrames.set(matchId, (droppedFrames.get(matchId) ?? 0) + 1);
    }
  }
}

// safeSend returns true if sent, false if dropped
function safeSend(ws, data) {
  if (ws.readyState !== WebSocket.OPEN) return false;
  if (ws.bufferedAmount > 16_384) return false;
  ws.send(data);
  return true;
}

export function getDroppedFrames(matchId) {
  return droppedFrames.get(matchId) ?? 0;
}
```

### Key Gotchas
- The `droppedFrames` Map grows with one entry per match and is never pruned. This is acceptable — the number of matches is bounded (dozens, not millions). If needed, reset entries when a match finishes.
- Expose `getDroppedFrames()` so the health endpoint (T056) can include drop metrics.

---

## [x] T049 — Add `maxConnections` Guard to `src/websocket/server.js`

### Overview
Prevents the server from accepting more connections than it can reliably serve. A client that gets rejected receives a clear error message rather than a silent timeout.

### Files to Create / Modify
- `src/websocket/server.js` — add connection count check inside `wss.on('connection', ...)`

### Requirements
```js
const MAX_CONNECTIONS = parseInt(process.env.MAX_CONNECTIONS ?? '10000', 10);

wss.on('connection', (ws) => {
  if (wss.clients.size > MAX_CONNECTIONS) {
    ws.send(JSON.stringify({ type: 'error', code: 'SERVER_FULL', message: 'Connection limit reached' }));
    ws.close();
    return;
  }
  // ... rest of connection setup
});
```

### Environment Variables
- `MAX_CONNECTIONS` — defaults to `10000`. Tune based on available server memory (each WebSocket connection uses ~4KB of memory for its send/receive buffers).

### Key Gotchas
- `wss.clients.size` at the time of the `connection` event already includes the new connection. The guard must use `>` not `>=` relative to the limit, or the last allowed connection will be rejected.
- Call `ws.close()` not `ws.terminate()` here — the client deserves a graceful close with the error message delivered before the connection ends.

---

## [x] T050 — Verify DB Pool Cannot Be Exhausted by WebSocket Load

### Overview
Confirms the pool configuration in `src/db/db.js` is sufficient and that WebSocket handlers cannot create an unbounded number of concurrent DB connections.

### Files to Create / Modify
- `src/db/db.js` — review only; no code change expected if T007 was done correctly

### Requirements
Verify the pool is configured as:
```js
new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});
```

### Key Gotchas
- The `commentaryList` poll and `handleSubscribe` both issue DB queries. Under 10,000 concurrent connections all sending `subscribe` simultaneously, up to 10,000 concurrent DB queries can be initiated. The pool queues them — with `max: 20` only 20 run concurrently and the rest wait.
- `connectionTimeoutMillis: 5000` ensures waiting queries fail after 5s rather than queuing indefinitely. Without this, a slow DB during a traffic spike causes the Node.js event loop to fill with pending pool requests.
- Neon free tier: 20 concurrent connections maximum. Do not raise `max` above this.

### Testing
During the load test (T047), monitor Neon's connection count in the Neon dashboard. It should stay at or below 20 even with 1,000 WebSocket clients connected.
