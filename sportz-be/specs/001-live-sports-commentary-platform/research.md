# Research: Live Cricket Commentary Platform

**Updated**: 2026-04-13
**Phase**: 0 — Data source confirmed, all decisions resolved

---

## 1. Data Source Decision

### What Was Evaluated

| Option | Commentary? | Free? | WebSocket? | Decision |
|--------|------------|-------|-----------|---------|
| CricketData.org | Partial (WIP) | 100 req/day | No | Rejected — too low |
| Roanuz Cricket API | Yes (Socket.IO) | 7–10 day trial only | Yes | Rejected — not free |
| ESPN Cricinfo (unofficial) | Yes | Non-commercial only | No | Rejected — ToS risk |
| cricbuzz-live (GitHub) | Yes | Free, no key | No | Development fallback |
| **Cricbuzz via RapidAPI** | **Yes — ball-by-ball** | **500k req/month free** | **No (REST)** | **Selected** |

### Why Cricbuzz via RapidAPI

- **Same data source Google Search uses** for live cricket scores and commentary
- **500,000 requests/month free** — covers ~347 matches/month polling every 30s for 4 hours each
- **Official RapidAPI wrapper** — not scraping, not ToS violation for building projects
- **Ball-by-ball commentary text** — actual commentary strings, not just scores
- **No WebSocket upstream** — Cricbuzz does not expose a public WebSocket API; REST polling is the only option

**Rationale for polling**: The upstream being REST does not affect fan experience. Backend polls Cricbuzz every 15–30s, detects new balls, then pushes to fans via WebSocket instantly. From a fan's perspective it is real-time.

---

## 2. Cricbuzz RapidAPI — Key Endpoints

**Base URL**: `https://cricbuzz-cricket.p.rapidapi.com`
**Auth headers**:
```
x-rapidapi-key: {RAPIDAPI_KEY}
x-rapidapi-host: cricbuzz-cricket.p.rapidapi.com
```

### Endpoints Used in This Project

| Endpoint | Purpose | Called By |
|----------|---------|----------|
| `GET /matches/v1/live` | List all currently live matches | Startup + every 5 min to detect new matches |
| `GET /mcenter/v1/{matchId}/commentary` | Ball-by-ball commentary for a match | Poller every 15–30s per live match |
| `GET /mcenter/v1/{matchId}/score` | Live scorecard (runs, wickets, overs) | Poller every 15–30s per live match |
| `GET /series/v1/{seriesId}` | Series info (IPL, World Cup etc.) | Match creation |

### Sample Commentary Response

```json
{
  "commentaryList": [
    {
      "commentsInfo": "FOUR! Kohli drives through covers. Beautiful timing.",
      "overSep": { "overNum": 15, "balls": "15.4" },
      "batTeamName": "India",
      "event": "BOUNDARY",
      "batsman1": { "batId": 253802, "batName": "V Kohli", "batRuns": 67, "batBalls": 52 },
      "batsman2": { "batId": 1413042, "batName": "KL Rahul", "batRuns": 34, "batBalls": 28 },
      "bowler1": { "bowlId": 8048, "bowlName": "P Cummins", "bowlOvs": "15.4", "bowlRuns": 52, "bowlWkts": 1 }
    }
  ],
  "matchHeader": {
    "matchId": 67890,
    "seriesName": "IPL 2026",
    "team1": { "name": "Royal Challengers Bengaluru" },
    "team2": { "name": "Mumbai Indians" },
    "status": "RCB opt to bat",
    "matchFormat": "T20"
  }
}
```

### Sample Live Score Response

```json
{
  "scoreCard": [
    {
      "inningsId": 1,
      "batTeamName": "Royal Challengers Bengaluru",
      "score": 156,
      "wickets": 4,
      "overs": 16.3,
      "runRate": 9.45
    }
  ]
}
```

---

## 3. Polling Architecture — Deduplication

**Problem**: Cricbuzz returns the full commentary list every poll. If the match hasn't progressed, the same balls will be returned again.

**Solution**: Track `lastSeenBall` per match using the `overSep.balls` field (e.g., `"15.4"`) as a unique cursor per match.

```js
const lastSeenBall = new Map(); // Map<matchId, string>

async function pollMatch(matchId, cricbuzzId) {
  const { commentaryList } = await fetchCricbuzz(`/mcenter/v1/${cricbuzzId}/commentary`);
  const latest = commentaryList[0];
  const ballKey = latest.overSep?.balls;

  if (!ballKey || lastSeenBall.get(matchId) === ballKey) return; // no new ball

  lastSeenBall.set(matchId, ballKey);
  await publishEvent(matchId, normalizeBall(latest));
}
```

**Why `overSep.balls` and not `createdAt`**: Timestamps can collide at high write rates. The `"over.ball"` string (e.g., `"15.4"`) is unique within a match innings.

---

## 4. WebSocket Pub/Sub (unchanged from initial research)

**Pattern**: `Map<matchId, Set<WebSocket>>` in-memory registry with back-references on each socket.

```js
// Heartbeat — 15s interval, ghost detected within 30s
setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 15_000);

// Backpressure check on every send
function safeSend(ws, data) {
  if (ws.readyState !== ws.OPEN) return;
  if (ws.bufferedAmount > 16384) return; // drop for slow consumer
  ws.send(data);
}
```

**Cleanup**: `ws.on('close')` iterates `ws.matchIds` and removes socket from all subscriptions. Error handler calls `ws.terminate()` to guarantee close fires.

---

## 5. Neon PostgreSQL + Drizzle ORM (unchanged from initial research)

- `pg.Pool` (not Neon serverless driver) — correct for always-on Hostinger Node.js process
- Use Neon **pooler** connection endpoint — not direct endpoint
- Pool: `max: 20`, `idleTimeoutMillis: 30_000`
- Reconnect cursor: `sequence` field (monotonically increasing per match), not `createdAt`
- Index: `(matchId, sequence)` composite — hot path for missed-events query
- Publish pattern: DB insert → broadcast (never broadcast inside transaction)

---

## 6. ArcJet Rate Limiting (unchanged from initial research)

- `noServer: true` on WebSocketServer — mandatory for ArcJet at upgrade event
- REST: sliding window 50 req/10s per IP
- WS upgrade: sliding window 5 connections/2s per IP
- Both use same `aj` instance; WS uses `aj.withRule(...)` override
- `socket.destroy()` after rejection response — prevents TCP socket leak

---

## 7. Request Budget Analysis

**Free tier**: 500,000 requests/month on RapidAPI

| Scenario | Requests/match | Matches/day | Daily requests | Monthly requests |
|----------|---------------|-------------|----------------|-----------------|
| T20 (4h, poll 30s) | 480 | 4 | 1,920 | 57,600 |
| ODI (8h, poll 30s) | 960 | 2 | 1,920 | 57,600 |
| Test day (6h, poll 30s) | 720 | 1 | 720 | 21,600 |
| **Worst case** (10 T20s/day) | 480 | 10 | 4,800 | 144,000 |

Even in the worst case, **144,000/month is well within the 500,000 free limit.** The free tier is sufficient for production at moderate scale.

---

## 8. Unresolved Items

None. All decisions are confirmed:
- Sport: Cricket only
- Data source: Cricbuzz via RapidAPI (REST polling)
- Fan delivery: WebSocket push
- Deduplication: `lastSeenBall` Map using `overSep.balls` cursor
- Database: Existing Neon PostgreSQL + Drizzle schema (with index additions)
