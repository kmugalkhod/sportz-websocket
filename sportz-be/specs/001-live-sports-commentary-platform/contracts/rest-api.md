# REST API Contract

**Version**: 1.1 (updated 2026-04-13 — cricket only)
**Base URL**: `http://<host>/api`
**Format**: JSON
**Rate limit**: 50 requests / 10-second sliding window per IP (ArcJet)

---

## Authentication

Read endpoints (`GET`) — no authentication. Public access for fans.
Write endpoints (`POST`, `PATCH`) — not needed in v1. Data enters via the Cricbuzz adapter, not via REST POST. The only write path is the internal `publishEvent()` service called by the adapter.

---

## Health Check

### `GET /health`

Returns service status. Used by Site24x7 monitoring.

**Response 200**:
```json
{
  "status": "ok",
  "timestamp": "2026-04-13T10:30:00.000Z",
  "uptime": 3600,
  "websocket": {
    "connectedClients": 1247,
    "activeSubscriptions": 1891
  },
  "database": {
    "status": "ok",
    "poolSize": 20,
    "idleConnections": 17
  },
  "cricbuzz": {
    "activePollers": 3,
    "lastPollAt": "2026-04-13T10:29:58.000Z"
  }
}
```

**Response 503** (if DB unreachable):
```json
{
  "status": "degraded",
  "database": { "status": "error", "message": "Connection timeout" }
}
```

---

## Matches

### `GET /api/matches`

List cricket matches, optionally filtered by status.

**Query parameters**:

| Param | Type | Description |
|-------|------|-------------|
| `status` | `scheduled \| live \| finished` | Filter by match status |
| `format` | `T20 \| ODI \| TEST` | Filter by match format |
| `series` | string | Filter by series name (partial match) |

**Response 200**:
```json
{
  "matches": [
    {
      "id": 42,
      "sport": "cricket",
      "homeTeam": "Royal Challengers Bengaluru",
      "awayTeam": "Mumbai Indians",
      "status": "live",
      "seriesName": "IPL 2026",
      "matchFormat": "T20",
      "venue": "M. Chinnaswamy Stadium",
      "startTime": "2026-04-13T14:00:00.000Z",
      "homeScore": 156,
      "homeWickets": 4,
      "homeOvers": "16.3",
      "awayScore": 0,
      "awayWickets": 0,
      "awayOvers": "0.0",
      "cricbuzzMatchId": 67890
    }
  ]
}
```

---

### `GET /api/matches/:id`

Get a single match by internal ID.

**Response 200**: Single match object (same shape as list item).
**Response 404**: `{ "error": "Match not found" }`

---

## Commentary Events

### `GET /api/matches/:id/events`

Retrieve ball-by-ball commentary history for a match. Used for:
- Initial page load (full history)
- Missed-event delivery on reconnect (use `after` param)

**Query parameters**:

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `after` | integer | — | Return only events with `sequence > after`. Used for reconnect recovery. |
| `limit` | integer | 100 | Max events to return. Max 500. |
| `period` | string | — | Filter by innings: `1ST_INN \| 2ND_INN` |

**Response 200**:
```json
{
  "events": [
    {
      "id": 1834,
      "matchId": 42,
      "sequence": 47,
      "period": "1ST_INN",
      "eventType": "boundary_four",
      "actor": "V Kohli",
      "team": "Royal Challengers Bengaluru",
      "message": "FOUR! Kohli drives through covers. Beautiful timing.",
      "metadata": {
        "over": "15.4",
        "runs": 4,
        "bowler": "P Cummins"
      },
      "tags": ["boundary", "four"],
      "createdAt": "2026-04-13T10:35:22.000Z"
    }
  ],
  "total": 47,
  "lastSequence": 47
}
```

**Response 404**: Match not found.

**Example — reconnect recovery**:
```
GET /api/matches/42/events?after=35
→ returns events with sequence 36, 37, 38...47
→ client resumes live stream from sequence 47 onwards
```

---

## Error Response Format

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE"
}
```

| HTTP Code | Meaning |
|-----------|---------|
| 400 | Bad request / validation error |
| 403 | Bot detected or ArcJet shield |
| 404 | Resource not found |
| 429 | Rate limit exceeded |
| 500 | Internal server error |
| 503 | Database unreachable |

---

## Note: No Write Endpoints

There are no `POST` endpoints for creating matches or events in v1. All data enters through the **Cricbuzz adapter** (`src/adapters/cricbuzz.js`) which:

1. Polls `GET /matches/v1/live` on Cricbuzz every 5 minutes to discover new live matches
2. For each live match, polls `GET /mcenter/v1/{cricbuzzId}/commentary` every 15–30s
3. Detects new balls via deduplication
4. Calls `publishEvent()` internally — no HTTP round-trip

This means the REST API is **read-only for fans**. The Cricbuzz adapter is the only write path.
