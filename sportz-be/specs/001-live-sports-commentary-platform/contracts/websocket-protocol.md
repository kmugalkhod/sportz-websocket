# WebSocket Protocol Contract

**Version**: 1.1 (updated 2026-04-13 — cricket only)
**Transport**: WebSocket (RFC 6455), same port as REST
**Endpoint**: `ws://<host>/ws`
**Frame format**: JSON text frames only

---

## Connection Lifecycle

```
Client                                    Server
  |                                          |
  |-- HTTP GET /ws (Upgrade: websocket) ---> |
  |                                          |-- ArcJet: 5 connections/2s per IP
  |                                          |   DENY → 429 + socket.destroy()
  |                                          |   ALLOW → wss.handleUpgrade()
  |<-- 101 Switching Protocols ------------- |
  |                                          |-- assign connectionId (UUID)
  |                                          |-- ws.isAlive = true, ws.matchIds = Set()
  |                                          |
  |-- { type: "subscribe", matchId: 42 } --> |-- registry.subscribe(ws, 42)
  |<-- { type: "subscribed", matchId: 42 } - |
  |                                          |
  |              [every 15s]                 |
  |<-- WebSocket ping frame --------------- |
  |-- WebSocket pong frame --------------> |-- ws.isAlive = true
  |                                          |
  |              [Cricbuzz returns new ball] |
  |<-- { type: "ball_event", ... } -------- |-- broadcast to all match 42 subscribers
  |<-- { type: "score_update", ... } ------ |
  |                                          |
  |-- { type: "unsubscribe", matchId: 42 } ->|-- registry.unsubscribe(ws, 42)
  |-- close frame -------------------------> |-- cleanup all subscriptions
```

---

## Message Schema

Every message (in both directions) MUST include:

```json
{
  "type": "string",        // REQUIRED — message intent
  "timestamp": "string"   // REQUIRED — ISO 8601 UTC
}
```

Unknown `type` values: server sends `error` with code `UNKNOWN_TYPE` and logs warning.

---

## Client → Server Messages

### `subscribe`

Subscribe to live ball-by-ball events for a specific cricket match.

```json
{
  "type": "subscribe",
  "timestamp": "2026-04-13T10:30:00.000Z",
  "matchId": 42,
  "lastSequence": 0
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `matchId` | integer | yes | Internal match ID |
| `lastSequence` | integer | no | Last ball sequence received. If > 0, server delivers all missed balls first. Default: `0` |

**Response**: `subscribed` message, then missed `ball_event` messages (if `lastSequence > 0`), then live stream begins.

---

### `unsubscribe`

```json
{
  "type": "unsubscribe",
  "timestamp": "2026-04-13T10:31:00.000Z",
  "matchId": 42
}
```

**Response**: `unsubscribed` message.

---

### `ping`

Application-layer keepalive (optional — server also sends WS protocol pings every 15s).

```json
{
  "type": "ping",
  "timestamp": "2026-04-13T10:32:00.000Z"
}
```

**Response**: `pong` message.

---

## Server → Client Messages

### `subscribed`

```json
{
  "type": "subscribed",
  "timestamp": "2026-04-13T10:30:00.100Z",
  "matchId": 42,
  "matchStatus": "live",
  "seriesName": "IPL 2026",
  "matchFormat": "T20"
}
```

---

### `ball_event`

Sent for every new ball detected from Cricbuzz. This is the primary message fans receive.

```json
{
  "type": "ball_event",
  "timestamp": "2026-04-13T10:35:22.000Z",
  "matchId": 42,
  "event": {
    "id": 1834,
    "sequence": 47,
    "period": "1ST_INN",
    "eventType": "boundary_four",
    "actor": "V Kohli",
    "team": "Royal Challengers Bengaluru",
    "message": "FOUR! Kohli drives through covers. Beautiful timing.",
    "metadata": {
      "over": "15.4",
      "runs": 4,
      "bowler": "P Cummins",
      "bowlerWickets": 1,
      "bowlerRuns": 52
    },
    "tags": ["boundary", "four"],
    "createdAt": "2026-04-13T10:35:22.000Z"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `event.sequence` | integer | Monotonically increasing per match — **use as reconnect cursor** |
| `event.period` | string | `1ST_INN \| 2ND_INN \| SUPER_OVER` |
| `event.eventType` | string | See cricket event type registry in `data-model.md` |
| `event.actor` | string | Batsman on strike |
| `event.message` | string | Cricbuzz commentary text |
| `event.metadata.over` | string | e.g., `"15.4"` (over 15, ball 4) |

---

### `score_update`

Sent alongside `ball_event` when the score changes (runs scored, wicket falls).

```json
{
  "type": "score_update",
  "timestamp": "2026-04-13T10:35:22.100Z",
  "matchId": 42,
  "score": {
    "battingTeam": "Royal Challengers Bengaluru",
    "runs": 156,
    "wickets": 4,
    "overs": "16.3",
    "runRate": 9.45,
    "inningsNum": 1
  }
}
```

---

### `match_update`

Sent when match status changes (innings end, match result, rain delay).

```json
{
  "type": "match_update",
  "timestamp": "2026-04-13T10:50:00.000Z",
  "matchId": 42,
  "match": {
    "status": "finished",
    "result": "Royal Challengers Bengaluru won by 24 runs",
    "homeScore": 187,
    "homeWickets": 6,
    "homeOvers": "20.0",
    "awayScore": 163,
    "awayWickets": 9,
    "awayOvers": "20.0"
  }
}
```

---

### `unsubscribed`

```json
{
  "type": "unsubscribed",
  "timestamp": "2026-04-13T10:31:00.050Z",
  "matchId": 42
}
```

---

### `pong`

```json
{
  "type": "pong",
  "timestamp": "2026-04-13T10:32:00.010Z"
}
```

---

### `error`

```json
{
  "type": "error",
  "timestamp": "2026-04-13T10:30:00.150Z",
  "code": "MATCH_NOT_FOUND",
  "message": "Match 9999 does not exist"
}
```

| Error Code | Trigger |
|-----------|---------|
| `MATCH_NOT_FOUND` | `subscribe` with non-existent `matchId` |
| `MATCH_FINISHED` | `subscribe` to a completed match |
| `INVALID_MESSAGE` | Bad JSON or missing `type` field |
| `UNKNOWN_TYPE` | Unrecognized message type |
| `INTERNAL_ERROR` | Unexpected server error |

---

## Reconnection Protocol (Client Responsibility)

```
lastSequenceByMatch = {}  // persisted in localStorage or memory

onDisconnect:
  baseDelay = 1000ms, maxDelay = 30000ms, attempt = 0
  delay = min(1000 * 2^attempt + random(0..1000), 30000)
  attempt++
  setTimeout(reconnect, delay)

onConnect:
  attempt = 0
  for each previousMatchId:
    send { type: 'subscribe', matchId, lastSequence: lastSequenceByMatch[matchId] ?? 0 }

onBallEvent:
  lastSequenceByMatch[event.matchId] = event.sequence
```

The `lastSequence` in the subscribe message triggers server to deliver all missed balls from PostgreSQL before resuming live stream.

---

## Rate Limits

| Action | Limit | Layer |
|--------|-------|-------|
| WS connection attempts | 5 per 2s per IP | ArcJet at HTTP upgrade |
| Messages per connection | No hard limit (v1) | Future: 100/s |
