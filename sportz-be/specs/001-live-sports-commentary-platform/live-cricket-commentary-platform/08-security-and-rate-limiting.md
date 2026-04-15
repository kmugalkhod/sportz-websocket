# Phase 8: Security & Rate Limiting (User Story 6 — P3)

**Tasks**: T051 – T055 | **Depends on**: Phase 2 complete (Foundation); can be done independently of Phases 3–7  
**Goal**: ArcJet blocks bot fingerprints and enforces per-IP rate limits on both REST requests and WebSocket upgrade attempts. Legitimate fans are unaffected.  
**Checkpoint**: 51st REST request in 10s from same IP → `429`. 6th WS upgrade attempt in 2s → rejected. Legitimate fan still connects fine. `npm test` — all tests pass.

> **Write test T051 first. Run it. Confirm it FAILS. Then implement T052 onwards.**

---

## T051 — Integration Test: ArcJet Blocks Denied REST Requests

### Overview
Tests that the ArcJet Express middleware returns `429` when ArcJet denies the request, and `200` for normal requests.

### Files to Create / Modify
- `tests/integration/matches.test.js` — new file

### Requirements
```js
import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';

// Mock ArcJet before importing the app
jest.mock('@arcjet/node', () => ({
  default: () => ({
    protect: jest.fn().mockResolvedValue({ isDenied: () => false }),
    withRule: jest.fn().mockReturnThis(),
  }),
  shield: jest.fn(),
  detectBot: jest.fn(),
  slidingWindow: jest.fn(),
}));

import { app } from '../../src/index.js';

describe('ArcJet middleware', () => {
  it('allows normal GET /api/matches', async () => {
    const res = await request(app).get('/api/matches');
    expect(res.status).toBe(200);
  });

  it('returns 429 when ArcJet denies request', async () => {
    const { default: arcjet } = await import('@arcjet/node');
    arcjet().protect.mockResolvedValueOnce({ isDenied: () => true, reason: { isRateLimit: () => true } });

    const res = await request(app).get('/api/matches');
    expect(res.status).toBe(429);
  });
});
```

### Key Gotchas
- Mock `@arcjet/node` before importing `app` — Jest's module registry loads ArcJet at import time. If the real module loads first, the mock has no effect.
- The test does not actually exercise ArcJet's ML-based bot detection (that would require real HTTP traffic). It only tests that the middleware correctly calls `isDenied()` and maps the result to an HTTP status code.

---

## T052 — Create `src/middleware/arcjet.js` — ArcJet Singleton and Express Middleware

### Overview
Initialises a single ArcJet instance with three stacked rules: network shield, bot detection, and a sliding-window rate limit. Exports it both as a raw `aj` instance (for the WebSocket rule extension in T053) and as an Express middleware function.

### Files to Create / Modify
- `src/middleware/arcjet.js` — new file

### Requirements
```js
import arcjet, { shield, detectBot, slidingWindow } from '@arcjet/node';

export const aj = arcjet({
  key: process.env.ARCJET_KEY,
  characteristics: ['ip.src'],
  rules: [
    shield({ mode: 'LIVE' }),
    detectBot({ mode: 'LIVE', allow: ['CATEGORY:SEARCH_ENGINE'] }),
    slidingWindow({ interval: 10, max: 50 }),
  ],
});

export async function arcjetMiddleware(req, res, next) {
  const decision = await aj.protect(req);
  if (decision.isDenied()) {
    if (decision.reason.isBot?.()) return res.status(403).json({ error: 'Bot detected' });
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }
  next();
}
```

### Environment Variables
- `ARCJET_KEY` — ArcJet dashboard API key
- `ARCJET_ENV=development` — when set, ArcJet runs in dry-run mode and does not block. Remove in production.

### Key Gotchas
- `shield()` blocks known attack patterns (SQLi, XSS probes, etc.) regardless of rate limits.
- `detectBot({ allow: ['CATEGORY:SEARCH_ENGINE'] })` permits Google/Bing crawlers while blocking malicious bots. Without the allow list, all automated traffic (including monitoring tools) is blocked.
- The `slidingWindow({ interval: 10, max: 50 })` allows 50 requests per 10-second window per IP. The 51st request within that window returns `429`.

### References
- [research.md — ArcJet Rate Limiting](../research.md#6-arcjet-rate-limiting-unchanged-from-initial-research) — configuration rationale

---

## T053 — Add Stricter WebSocket Rate Rule to `src/middleware/arcjet.js`

### Overview
WebSocket connections are more expensive to maintain than individual REST requests. A separate, tighter rate rule is added for the upgrade handshake to limit connection storms from a single IP.

### Files to Create / Modify
- `src/middleware/arcjet.js` — add `wsAj` export

### Requirements
```js
export const wsAj = aj.withRule(
  slidingWindow({ interval: 2, max: 5 })
);
```

This creates a derived ArcJet instance with the base rules (shield + bot detection) **plus** a tighter window: 5 WebSocket connections per 2 seconds per IP. The 6th attempt within 2 seconds is rejected at the TCP layer.

### Key Gotchas
- `.withRule()` creates a new instance — `wsAj` does not mutate `aj`. REST requests continue using the original `aj` with 50 req/10s.
- The WebSocket guard runs at the HTTP upgrade event, not inside the WebSocket message handler — rejections happen before the connection is established, preventing any server-side state from being created for the rejected connection.

---

## T054 — Mount `arcjetMiddleware` in `src/index.js` Before All Routes

### Overview
The ArcJet middleware must be registered before any route handler so that every incoming REST request is checked before business logic runs.

### Files to Create / Modify
- `src/index.js` — add `app.use(arcjetMiddleware)` before route mounts

### Requirements
```js
import { arcjetMiddleware } from './middleware/arcjet.js';

app.use(express.json());
app.use(arcjetMiddleware);          // ← must be before routes
app.use(healthRouter);
app.use('/api/matches', matchesRouter);
app.use('/api/matches/:id/events', eventsRouter);
```

### Key Gotchas
- `GET /health` should also pass through ArcJet — monitoring tools that hit it excessively could be rate limited. If your monitoring tool has a fixed IP, add it to ArcJet's allow list in the dashboard.
- `express.json()` must still be before `arcjetMiddleware` so that `req.body` is parsed before ArcJet tries to inspect it.

---

## T055 — Guard WebSocket Upgrades with `wsAj` in `src/index.js`

### Overview
Intercepts HTTP upgrade requests before the WebSocket server accepts them. ArcJet runs the sliding-window check. Denied connections get a proper HTTP 429 response and the socket is destroyed — no WebSocket state is created.

### Files to Create / Modify
- `src/index.js` — update the `server.on('upgrade', ...)` handler (replacing the plain upgrade from T023)

### Requirements
```js
import { wsAj } from './middleware/arcjet.js';

server.on('upgrade', async (req, socket, head) => {
  try {
    const decision = await wsAj.protect(req);
    if (decision.isDenied()) {
      socket.write('HTTP/1.1 429 Too Many Requests\r\nContent-Length: 0\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  } catch (err) {
    console.error({ level: 'error', message: 'ArcJet upgrade error', err: err.message });
    socket.destroy();
  }
});
```

### Key Gotchas
- `socket.destroy()` after writing the 429 response is mandatory — without it, the TCP socket stays open and the connection is never actually closed. This is a subtle resource leak.
- The `upgrade` event fires before any WebSocket handshake — `socket` here is a raw `net.Socket`, not a `WebSocket`. Do not try to call `ws.send()` on it.
- If `wsAj.protect()` throws (e.g., ArcJet service unreachable), the catch block destroys the socket rather than allowing the connection. Fail-closed is the correct behaviour for a security layer.

### References
- [websocket-protocol.md — Rate Limits](../contracts/websocket-protocol.md#rate-limits) — 5 connections/2s per IP
