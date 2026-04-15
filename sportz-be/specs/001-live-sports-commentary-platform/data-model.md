# Data Model: Live Cricket Commentary Platform

**Updated**: 2026-04-13
**Source**: `spec.md` + existing `src/db/schema.js` + Cricbuzz API response structure

---

## Entities Overview

```
matches ──< commentary
```

Two persisted entities. Fan connection state is **in-memory only** — held in the WebSocket registry at runtime, lost on restart (clients reconnect and re-subscribe).

---

## Entity 1: Match

**Table**: `matches`
**Status**: Exists in `src/db/schema.js` — index + timezone additions required.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `serial` | PK | Auto-increment |
| `sport` | `text` | NOT NULL | Always `"cricket"` for v1 |
| `home_team` | `text` | NOT NULL | e.g., `"Royal Challengers Bengaluru"` |
| `away_team` | `text` | NOT NULL | e.g., `"Mumbai Indians"` |
| `status` | `match_status` enum | NOT NULL, default `scheduled` | `scheduled \| live \| finished` |
| `start_time` | `timestamp with timezone` | NOT NULL | UTC match start |
| `end_time` | `timestamp with timezone` | nullable | UTC match end |
| `home_score` | `integer` | NOT NULL, default `0` | Current innings runs |
| `away_score` | `integer` | NOT NULL, default `0` | Current innings runs |
| `created_at` | `timestamp with timezone` | NOT NULL, default `now()` | Row creation |

**Cricket-specific fields** (stored in extended metadata — add as new columns or extend schema):

| Column | Type | Description |
|--------|------|-------------|
| `cricbuzz_match_id` | `integer` | Cricbuzz's internal match ID — used for polling |
| `series_name` | `text` | e.g., `"IPL 2026"`, `"ICC World Cup 2026"` |
| `match_format` | `text` | `T20 \| ODI \| TEST` |
| `venue` | `text` | Stadium name |
| `home_wickets` | `integer` | default `0` |
| `away_wickets` | `integer` | default `0` |
| `home_overs` | `text` | e.g., `"16.3"` |
| `away_overs` | `text` | e.g., `"20.0"` |

**Schema migration required**:
```js
// Add to matches table definition in src/db/schema.js
cricbuzzMatchId: integer('cricbuzz_match_id').unique(),
seriesName: text('series_name'),
matchFormat: text('match_format'),  // T20 | ODI | TEST
venue: text('venue'),
homeWickets: integer('home_wickets').default(0).notNull(),
awayWickets: integer('away_wickets').default(0).notNull(),
homeOvers: text('home_overs').default('0.0').notNull(),
awayOvers: text('away_overs').default('0.0').notNull(),
```

**Indexes to add**:
```js
(table) => ({
  statusIdx: index('matches_status_idx').on(table.status),
  cricbuzzIdx: index('matches_cricbuzz_idx').on(table.cricbuzzMatchId),
})
```

**State transitions**:
```
scheduled → live → finished
```
Only `live` matches are polled by the Cricbuzz adapter.

---

## Entity 2: Commentary (Ball Event)

**Table**: `commentary`
**Status**: Exists in `src/db/schema.js` — composite index required, column review needed.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `serial` | PK | Auto-increment |
| `match_id` | `integer` | NOT NULL, FK → `matches.id` | Parent match |
| `minute` | `integer` | NOT NULL | Over number (repurposed — e.g., over 15 = minute 15) |
| `sequence` | `integer` | NOT NULL | Monotonically increasing per match — **reconnect cursor** |
| `period` | `text` | NOT NULL | `1ST_INN \| 2ND_INN \| SUPER_OVER` |
| `event_type` | `text` | NOT NULL | See cricket event type registry below |
| `actor` | `text` | nullable | Batsman name |
| `team` | `text` | nullable | Batting team name |
| `message` | `text` | NOT NULL | Cricbuzz commentary string |
| `metadata` | `jsonb` | nullable | Ball details: bowler, runs, extras, dismissal info |
| `tags` | `text[]` | nullable | e.g., `["boundary", "four"]` |
| `created_at` | `timestamp with timezone` | NOT NULL, default `now()` | UTC event time |

**Required index** (hot query path):
```js
(table) => ({
  matchSeqIdx: index('commentary_match_seq_idx').on(table.matchId, table.sequence),
})
```

Used for:
- Missed-events reconnect: `WHERE match_id = ? AND sequence > ?`
- Historical feed load: `WHERE match_id = ? ORDER BY sequence ASC`

### Cricket Event Type Registry

| `event_type` | Description | `metadata` shape |
|-------------|-------------|-----------------|
| `ball` | Normal delivery | `{ over: "15.4", runs: 1, bowler: string, extras?: string }` |
| `boundary_four` | Four runs off the bat | `{ over: string, bowler: string, shotType?: string }` |
| `boundary_six` | Six runs | `{ over: string, bowler: string }` |
| `wicket` | Dismissal | `{ over: string, bowler: string, dismissalType: string, fielder?: string }` |
| `wide` | Wide delivery | `{ over: string, bowler: string }` |
| `no_ball` | No ball | `{ over: string, bowler: string, runs?: number }` |
| `dot_ball` | No runs scored | `{ over: string, bowler: string }` |
| `over_complete` | End of an over | `{ overNum: number, runs: number, wickets: number }` |
| `innings_start` | Innings begins | `{ inningsNum: 1 \| 2, battingTeam: string }` |
| `innings_end` | Innings complete | `{ inningsNum: 1 \| 2, score: string }` |
| `match_start` | Match begins | `{}` |
| `match_end` | Match finished | `{ result: string }` |
| `review` | DRS review | `{ reviewingTeam: string, outcome?: "upheld" \| "dismissed" }` |
| `rain_delay` | Play interrupted | `{ reason: string }` |
| `commentary` | General commentary text | `{}` |

### Dismissal Types (for `wicket` event)

`bowled`, `caught`, `lbw`, `run_out`, `stumped`, `hit_wicket`, `obstructing_field`, `handled_ball`, `retired_hurt`

---

## Entity 3: Fan Connection (In-Memory)

**Location**: `src/websocket/registry.js`
**Lifetime**: Process memory only. Clients reconnect on server restart.

| Property | Type | Description |
|----------|------|-------------|
| `ws.isAlive` | `boolean` | Heartbeat flag |
| `ws.matchIds` | `Set<number>` | Back-reference: subscribed match IDs |
| `ws.connectionId` | `string` | UUID for correlation logging |
| `ws.connectedAt` | `number` | `Date.now()` at connection time |

**Registry**:
```
Map<matchId: number, Set<WebSocket>>
```

---

## Entity 4: Cricbuzz Poll State (In-Memory)

**Location**: `src/adapters/cricbuzz.js`
**Purpose**: Deduplication — prevents broadcasting the same ball twice.

```js
const lastSeenBall = new Map();
// Map<internalMatchId: number, ballKey: string>
// ballKey = overSep.balls from Cricbuzz, e.g. "15.4"
```

Lost on restart — harmless, the worst case is one duplicate broadcast per match on server restart.

---

## Schema Migration Plan

### Migration 1: Add timezone to all timestamps

```js
// src/db/schema.js — update both tables
startTime: timestamp('start_time', { withTimezone: true }).notNull(),
endTime:   timestamp('end_time',   { withTimezone: true }),
createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
```

### Migration 2: Add cricket-specific columns to matches

```js
cricbuzzMatchId: integer('cricbuzz_match_id').unique(),
seriesName:      text('series_name'),
matchFormat:     text('match_format'),
venue:           text('venue'),
homeWickets:     integer('home_wickets').default(0).notNull(),
awayWickets:     integer('away_wickets').default(0).notNull(),
homeOvers:       text('home_overs').default('0.0').notNull(),
awayOvers:       text('away_overs').default('0.0').notNull(),
```

### Migration 3: Add indexes

```js
// matches table
(table) => ({
  statusIdx:    index('matches_status_idx').on(table.status),
  cricbuzzIdx:  index('matches_cricbuzz_idx').on(table.cricbuzzMatchId),
})

// commentary table
(table) => ({
  matchSeqIdx: index('commentary_match_seq_idx').on(table.matchId, table.sequence),
})
```

### Run migrations

```bash
npm run db:generate
npm run db:migrate
```
