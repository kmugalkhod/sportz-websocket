# Phase 3: Real-Time Event Pipeline (User Story 1 — P1 🎯 MVP)

**Tasks**: T013 – T024 | **Depends on**: Phase 2 complete  
**Goal**: Cricbuzz polled every 15–30s → new ball detected → saved to PostgreSQL → broadcast to subscribed fans over WebSocket within 2s.  
**Checkpoint**: `wscat -c ws://localhost:8000/ws` → subscribe → `ball_event` messages appear automatically. `npm test` — T013 and T014 pass.

> **Write tests T013–T014 first. Run them. Confirm they FAIL. Then implement T015 onwards.**

---

## T013 — Unit Test: `deduplicateBall()` Idempotency

### Overview
The deduplication function is the core safety mechanism that prevents the same ball from being saved and broadcast twice. It must be tested before the adapter is written.

### Files to Create / Modify
- `tests/unit/cricbuzz-adapter.test.js` — new file

### Requirements
```js
import { describe, it, expect, beforeEach } from '@jest/globals';
import { deduplicateBall } from '../../src/adapters/cricbuzz.js';

describe('deduplicateBall', () => {
  it('returns true for a new ball key', () => {
    expect(deduplicateBall(1, '15.4')).toBe(true);
  });

  it('returns false when the same ball key is seen again', () => {
    deduplicateBall(2, '16.1');
    expect(deduplicateBall(2, '16.1')).toBe(false);
  });

  it('isolates keys by matchId — same ball key on different matches are both new', () => {
    deduplicateBall(3, '1.1');
    expect(deduplicateBall(4, '1.1')).toBe(true);
  });
});
```

### Testing
Run `npm test` — all three cases should FAIL (function does not exist yet). This is the expected state before T017.

---

## T014 — Unit Test: `publishEvent()` DB Write Contract

### Overview
Verifies that `publishEvent()` calls drizzle's insert with the correct arguments and returns the saved row. Mocks the DB so the test runs without a real database connection.

### Files to Create / Modify
- `tests/unit/commentary.test.js` — new file

### Requirements
```js
import { describe, it, expect, jest } from '@jest/globals';

// Mock the db module before importing the service
jest.mock('../../src/db/db.js', () => ({
  db: { insert: jest.fn() },
}));

import { publishEvent } from '../../src/services/commentary.js';
import { db } from '../../src/db/db.js';

describe('publishEvent', () => {
  it('inserts event data with the correct matchId and returns the saved row', async () => {
    const fakeRow = { id: 1, matchId: 42, sequence: 1, message: 'Dot ball' };
    db.insert.mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([fakeRow]),
      }),
    });

    const result = await publishEvent(42, { message: 'Dot ball' });
    expect(result).toEqual(fakeRow);
    expect(db.insert).toHaveBeenCalled();
  });
});
```

### Testing
Run `npm test` — should FAIL before T009's broadcast wiring and before drizzle mock resolution. Expected failure state.

---

## T015 — Create `src/adapters/cricbuzz.js` — Live Match Fetcher

### Overview
The entry point for Cricbuzz data. `fetchLiveMatches()` is called at server startup and every 5 minutes to discover which matches are currently live and should be polled.

### Files to Create / Modify
- `src/adapters/cricbuzz.js` — new file

### Requirements
```js
const BASE_URL = 'https://cricbuzz-cricket.p.rapidapi.com';
const headers = {
  'x-rapidapi-key': process.env.RAPIDAPI_KEY,
  'x-rapidapi-host': 'cricbuzz-cricket.p.rapidapi.com',
};

export async function fetchLiveMatches() {
  const res = await fetch(`${BASE_URL}/matches/v1/live`, { headers });
  if (!res.ok) throw new Error(`Cricbuzz error: ${res.status}`);
  const data = await res.json();
  return data.typeMatches.flatMap(t => t.seriesMatches.flatMap(s => s.seriesAdWrapper?.matches ?? []));
}
```

### Environment Variables
- `RAPIDAPI_KEY` — server-side only. Must never appear in any response or client-facing log.

### Key Gotchas
- Cricbuzz nests live matches under `typeMatches[].seriesMatches[].seriesAdWrapper.matches` — the path is not flat. Use optional chaining (`?.`) to handle missing `seriesAdWrapper` nodes.
- Native `fetch` is available in Node.js v18+. No need for `node-fetch` if using Node.js v20 LTS.

### References
- [research.md — Cricbuzz Key Endpoints](../research.md#2-cricbuzz-rapidapi--key-endpoints)

---

## T016 — Add `fetchCommentary(cricbuzzMatchId)` to the Cricbuzz Adapter

### Overview
Fetches the ball-by-ball commentary list for a single match. Called every poll interval for each active live match.

### Files to Create / Modify
- `src/adapters/cricbuzz.js` — add function

### Requirements
```js
export async function fetchCommentary(cricbuzzMatchId) {
  const res = await fetch(`${BASE_URL}/mcenter/v1/${cricbuzzMatchId}/commentary`, { headers });
  if (!res.ok) throw new Error(`Cricbuzz commentary error: ${res.status}`);
  const data = await res.json();
  return data.commentaryList ?? [];
}
```

### Key Gotchas
- `commentaryList[0]` is the **most recent** ball — Cricbuzz returns newest-first. Do not iterate the full list; only process index 0.
- `commentaryList` can be null or missing on match start before the first ball — guard with `?? []`.

### References
- [research.md — Sample Commentary Response](../research.md#2-cricbuzz-rapidapi--key-endpoints) — exact JSON shape

---

## T017 — Add `deduplicateBall(matchId, ballKey)` to the Cricbuzz Adapter

### Overview
Prevents the same ball from being processed twice when consecutive polls return the same `commentaryList[0]`. Uses a simple in-memory Map — one entry per active match.

### Files to Create / Modify
- `src/adapters/cricbuzz.js` — add Map and function

### Requirements
```js
const lastSeenBall = new Map(); // Map<matchId: number, ballKey: string>

export function deduplicateBall(matchId, ballKey) {
  if (lastSeenBall.get(matchId) === ballKey) return false;
  lastSeenBall.set(matchId, ballKey);
  return true;
}
```

### Key Gotchas
- The ball key is `overSep.balls` from Cricbuzz (e.g., `"15.4"` = over 15, ball 4). Do NOT use `createdAt` as a key — timestamps can collide.
- On server restart this Map is empty, which means the first poll after restart will re-process the last ball. This results in at most one duplicate broadcast per match restart — acceptable for v1.
- **This is what T013 tests.** Running `npm test` after this task should make T013 pass.

---

## T018 — Add `normalizeBall(rawBall, matchId)` to the Cricbuzz Adapter

### Overview
Maps the raw Cricbuzz commentary object to the internal event shape that matches the `commentary` table columns and the `ball_event` WebSocket message schema.

### Files to Create / Modify
- `src/adapters/cricbuzz.js` — add function

### Requirements
```js
export function normalizeBall(rawBall, matchId) {
  const over = rawBall.overSep?.balls ?? '0.0';
  const overNum = parseInt(over.split('.')[0], 10);

  return {
    matchId,
    minute:    overNum,
    sequence:  0,           // assigned by DB insert (serial)
    period:    '1ST_INN',   // refined by match state logic later
    eventType: mapEventType(rawBall.event),
    actor:     rawBall.batsman1?.batName ?? null,
    team:      rawBall.batTeamName ?? null,
    message:   rawBall.commentsInfo ?? '',
    metadata: {
      over,
      runs:          rawBall.runs ?? 0,
      bowler:        rawBall.bowler1?.bowlName ?? null,
      bowlerWickets: rawBall.bowler1?.bowlWkts ?? 0,
      bowlerRuns:    rawBall.bowler1?.bowlRuns ?? 0,
    },
    tags: buildTags(rawBall.event),
  };
}
```

### Key Gotchas
- `sequence` is set to `0` here — the real value is assigned by PostgreSQL's `serial` column on insert. Never try to compute it client-side.
- Cricbuzz `event` values (`"BOUNDARY"`, `"WICKET"`, `"SIX"`) must be mapped to internal `eventType` strings (`"boundary_four"`, `"wicket"`, `"boundary_six"`). Build a `mapEventType()` helper.

### References
- [data-model.md — Cricket Event Type Registry](../data-model.md#cricket-event-type-registry) — full mapping table
- [research.md — Sample Commentary Response](../research.md#2-cricbuzz-rapidapi--key-endpoints) — Cricbuzz raw field names

---

## T019 — Add `startPolling(internalMatchId, cricbuzzMatchId)` to the Cricbuzz Adapter

### Overview
The polling loop for a single live match. Uses `setInterval` to call Cricbuzz every `POLL_INTERVAL_MS`, runs deduplication, normalizes the ball, and hands it to `publishEvent()`.

### Files to Create / Modify
- `src/adapters/cricbuzz.js` — add function + interval tracking Map

### Requirements
```js
const activePollers = new Map(); // Map<matchId, intervalId>

export function startPolling(internalMatchId, cricbuzzMatchId) {
  if (activePollers.has(internalMatchId)) return; // already polling

  const interval = setInterval(async () => {
    try {
      const list = await fetchCommentary(cricbuzzMatchId);
      if (!list.length) return;
      const latest = list[0];
      const ballKey = latest.overSep?.balls;
      if (!ballKey || !deduplicateBall(internalMatchId, ballKey)) return;
      const event = normalizeBall(latest, internalMatchId);
      await publishEvent(internalMatchId, event);
    } catch (err) {
      console.error({ level: 'error', message: 'Poll failed', matchId: internalMatchId, err: err.message });
    }
  }, parseInt(process.env.POLL_INTERVAL_MS ?? '15000', 10));

  activePollers.set(internalMatchId, interval);
}

export function stopPolling(internalMatchId) {
  const interval = activePollers.get(internalMatchId);
  if (interval) { clearInterval(interval); activePollers.delete(internalMatchId); }
}
```

### Environment Variables
- `POLL_INTERVAL_MS` — defaults to `15000` (15s). Lower values increase Cricbuzz API usage.

### Key Gotchas
- Guard against double-starting with `activePollers.has()`. Calling `startPolling` twice for the same match (e.g., on reconnect) would create duplicate intervals and double-broadcast every ball.
- Always wrap the poll body in `try/catch`. An unhandled rejection inside `setInterval` crashes the Node.js process in newer versions.
- Polling only runs for `live` matches — the caller (`startPollingAllLiveMatches`) must filter by `status = 'live'` before calling this.

---

## T020 — Create `src/websocket/registry.js` — Subscriber Map

### Overview
The in-memory pub/sub registry. Tracks which WebSocket connections are subscribed to which matches. This is the only source of truth for fan subscriptions — there is no DB backing for this.

### Files to Create / Modify
- `src/websocket/registry.js` — new file

### Requirements
```js
const registry = new Map(); // Map<matchId: number, Set<WebSocket>>

export function subscribe(ws, matchId) {
  if (!registry.has(matchId)) registry.set(matchId, new Set());
  registry.get(matchId).add(ws);
  ws.matchIds.add(matchId);
}

export function unsubscribe(ws, matchId) {
  const subs = registry.get(matchId);
  if (!subs) return;
  subs.delete(ws);
  if (subs.size === 0) registry.delete(matchId); // prune empty sets
  ws.matchIds.delete(matchId);
}

export function getSubscribers(matchId) {
  return registry.get(matchId) ?? new Set();
}
```

### Key Gotchas
- **Prune empty sets** — `if (subs.size === 0) registry.delete(matchId)`. Without this, the Map grows unboundedly for every match that ever had a subscriber, leaking memory over time.
- `ws.matchIds` is the back-reference on the socket itself. It is set in T023 (`ws.matchIds = new Set()`). The `subscribe` / `unsubscribe` functions write to it here. Both directions must stay in sync or cleanup on disconnect will silently miss subscriptions.

---

## T021 — Create `src/websocket/broadcaster.js` — Safe Event Broadcaster

### Overview
`broadcastToMatch()` iterates all subscribers for a match and sends the payload. The `safeSend` wrapper enforces two guards: the socket must be open, and its send buffer must not be backlogged.

### Files to Create / Modify
- `src/websocket/broadcaster.js` — new file

### Requirements
```js
import { WebSocket } from 'ws';
import { getSubscribers } from './registry.js';

export function broadcastToMatch(matchId, payload) {
  const data = JSON.stringify(payload);
  for (const ws of getSubscribers(matchId)) {
    safeSend(ws, data);
  }
}

function safeSend(ws, data) {
  if (ws.readyState !== WebSocket.OPEN) return;
  if (ws.bufferedAmount > 16_384) return; // drop frame for slow consumer
  ws.send(data);
}
```

### Key Gotchas
- `ws.bufferedAmount > 16384` drops the frame for a slow consumer rather than letting the buffer grow unboundedly. A slow fan misses some balls but the server does not accumulate memory per connection.
- Always `JSON.stringify` once outside the loop — not once per subscriber. For 10,000 fans, serializing 10,000 times is a CPU bottleneck.
- `ws.readyState !== WebSocket.OPEN` can happen between the registry lookup and the send — always check immediately before calling `ws.send()`.

---

## T022 — Wire `broadcastToMatch()` into `src/services/commentary.js`

### Overview
Completes the publish pipeline: after the DB insert commits, the saved row (with its real `sequence` and `id`) is broadcast to all subscribed fans. This is the only place broadcast is called.

### Files to Create / Modify
- `src/services/commentary.js` — add import and broadcast call

### Requirements
```js
import { broadcastToMatch } from '../websocket/broadcaster.js';

export async function publishEvent(matchId, eventData) {
  const [saved] = await db.insert(commentary).values({ matchId, ...eventData }).returning();

  broadcastToMatch(matchId, {
    type: 'ball_event',
    timestamp: new Date().toISOString(),
    matchId,
    event: saved,
  });

  return saved;
}
```

### Key Gotchas
- Broadcast happens **after** `.returning()` resolves — this guarantees the data is committed before any fan tries to query it.
- Do NOT `await` the broadcast. `broadcastToMatch` is synchronous (iterates a Set, calls `ws.send`). Awaiting it would be incorrect and serve no purpose.

### References
- [websocket-protocol.md — ball_event](../contracts/websocket-protocol.md#ball_event) — exact message shape fans expect

---

## T023 — Create `src/websocket/server.js` — WebSocket Connection Handler

### Overview
Attaches the WebSocket server to the HTTP server. Sets up per-connection state that all other modules depend on (`ws.isAlive`, `ws.matchIds`).

### Files to Create / Modify
- `src/websocket/server.js` — new file

### Requirements
```js
import { wss } from '../index.js';
import { registry } from './registry.js';

export function setupWebSocket(server) {
  server.on('upgrade', (req, socket, head) => {
    // ArcJet guard added in T055 — plain upgrade for now
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.matchIds = new Set();
    // message handler wired in T031
    // close + error handlers wired in T039
  });
}
```

### Key Gotchas
- `ws.matchIds = new Set()` must be initialized here on every new connection — before any `subscribe` call can happen. If it is missing, `registry.subscribe` will throw when it tries to call `ws.matchIds.add()`.
- `ws.isAlive = true` is the heartbeat flag. The heartbeat (T037) sets it to `false` on every ping and checks if it came back `true` before terminating.

---

## T024 — Wire Cricbuzz Polling and WebSocket Setup into `src/index.js`

### Overview
Final wiring step for the MVP pipeline: start the WebSocket server and begin polling all currently live matches when the HTTP server comes up.

### Files to Create / Modify
- `src/index.js` — add imports and startup calls

### Requirements
```js
import { setupWebSocket } from './websocket/server.js';
import { startPollingAllLiveMatches } from './adapters/cricbuzz.js';

server.on('listening', async () => {
  setupWebSocket(server);
  await startPollingAllLiveMatches();
});
```

`startPollingAllLiveMatches()` should query the DB for `status = 'live'` matches and call `startPolling(id, cricbuzzMatchId)` for each.

### Key Gotchas
- Call `setupWebSocket` inside the `'listening'` event — not before `server.listen()`. The HTTP upgrade event can only be received after the server is bound to a port.
- `startPollingAllLiveMatches` is a no-op during development when there are no live matches in the DB. Use the seed script from `quickstart.md` to insert a test match with `status = 'live'` for manual verification.

### References
- [quickstart.md](../quickstart.md) — seed script for inserting a test live match
