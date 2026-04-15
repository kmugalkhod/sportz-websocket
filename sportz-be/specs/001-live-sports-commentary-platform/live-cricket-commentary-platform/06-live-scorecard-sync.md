# Phase 6: Live Scorecard Synchronisation (User Story 4 — P2)

**Tasks**: T042 – T046 | **Depends on**: Phase 3 complete (`publishEvent` and broadcaster exist)  
**Goal**: Every scoring delivery (run, boundary, wicket) triggers a `score_update` message alongside `ball_event` so the displayed scoreline updates instantly without a page refresh.  
**Checkpoint**: Scoring ball arrives in `wscat` → immediately followed by `score_update` with new total. `GET /api/matches/:id` score fields reflect latest values. `npm test` — all tests pass.

> **Write test T042 first. Run it. Confirm it FAILS. Then implement T043 onwards.**

---

## T042 — Unit Test: `extractScoreUpdate()` Classifies Scoring Events

### Overview
`extractScoreUpdate()` reads a raw Cricbuzz ball object and classifies whether the score changed (runs, boundary, wicket). This drives whether a `score_update` broadcast is sent after `ball_event`.

### Files to Create / Modify
- `tests/unit/cricbuzz-adapter.test.js` — add new `describe` block to the existing file

### Requirements
```js
import { extractScoreUpdate } from '../../src/adapters/cricbuzz.js';

describe('extractScoreUpdate', () => {
  it('returns runs delta for a normal delivery', () => {
    const raw = { event: 'RUNS', runs: 1 };
    const result = extractScoreUpdate(raw);
    expect(result.runs).toBe(1);
    expect(result.wicketFell).toBe(false);
  });

  it('returns runs: 4 and no wicket for a boundary', () => {
    const raw = { event: 'BOUNDARY', runs: 4 };
    const result = extractScoreUpdate(raw);
    expect(result.runs).toBe(4);
    expect(result.wicketFell).toBe(false);
  });

  it('returns wicketFell: true for a wicket ball', () => {
    const raw = { event: 'WICKET', runs: 0 };
    expect(extractScoreUpdate(raw).wicketFell).toBe(true);
  });

  it('returns null for a dot ball with no score change', () => {
    const raw = { event: 'DOT_BALL', runs: 0 };
    expect(extractScoreUpdate(raw)).toBeNull();
  });
});
```

### Testing
Run `npm test` — should FAIL before T043. Expected state.

---

## T043 — Add `extractScoreUpdate(rawBall)` to `src/adapters/cricbuzz.js`

### Overview
Reads the Cricbuzz `event` field on a raw commentary ball and returns the score delta. Returns `null` for balls where the score does not change (dot balls, wides that don't score).

### Files to Create / Modify
- `src/adapters/cricbuzz.js` — add function

### Requirements
```js
const SCORING_EVENTS = new Set(['BOUNDARY', 'SIX', 'RUNS', 'WICKET', 'NO_BALL', 'WIDE']);

export function extractScoreUpdate(rawBall) {
  if (!SCORING_EVENTS.has(rawBall.event)) return null;

  return {
    runs:       rawBall.runs ?? 0,
    wicketFell: rawBall.event === 'WICKET',
    isBoundary: rawBall.event === 'BOUNDARY',
    isSix:      rawBall.event === 'SIX',
  };
}
```

### Key Gotchas
- Cricbuzz `event` values are uppercase strings: `"BOUNDARY"`, `"WICKET"`, `"SIX"`, `"WIDE"`, `"NO_BALL"`, `"DOT_BALL"`, `"RUNS"`. Map these consistently; a single typo silently suppresses score updates for that event type.
- `null` return means "no score change happened" — the caller skips the `score_update` broadcast for that ball.

### References
- [research.md — Sample Commentary Response](../research.md#2-cricbuzz-rapidapi--key-endpoints) — `event` field in raw Cricbuzz JSON

---

## T044 — Add `fetchScore(cricbuzzMatchId)` to `src/adapters/cricbuzz.js`

### Overview
Fetches the live scorecard for a match to get the authoritative current total (runs, wickets, overs, run rate). Called after a scoring ball is detected to get fresh numbers before broadcasting `score_update`.

### Files to Create / Modify
- `src/adapters/cricbuzz.js` — add function

### Requirements
```js
export async function fetchScore(cricbuzzMatchId) {
  const res = await fetch(`${BASE_URL}/mcenter/v1/${cricbuzzMatchId}/score`, { headers });
  if (!res.ok) throw new Error(`Cricbuzz score error: ${res.status}`);
  const data = await res.json();
  const innings = data.scoreCard?.[0]; // current innings
  return {
    runs:        innings?.score      ?? 0,
    wickets:     innings?.wickets    ?? 0,
    overs:       innings?.overs?.toString() ?? '0.0',
    runRate:     innings?.runRate    ?? 0,
    inningsNum:  innings?.inningsId  ?? 1,
    battingTeam: innings?.batTeamName ?? '',
  };
}
```

### Key Gotchas
- `scoreCard[0]` is the current (most recent) innings. In a T20 second innings, `scoreCard` may have two items — index 0 is still the current one based on Cricbuzz ordering.
- This is a second API call per scoring ball — adds to the RapidAPI request budget. At 500k req/month this is fine, but avoid calling it on every poll regardless of whether a scoring event occurred.

### References
- [research.md — Sample Live Score Response](../research.md#2-cricbuzz-rapidapi--key-endpoints)
- [research.md — Request Budget Analysis](../research.md#7-request-budget-analysis)

---

## T045 — Update `publishEvent()` to Broadcast Score Updates

### Overview
After the `ball_event` broadcast, checks if the ball was a scoring event. If so, fetches the updated score from Cricbuzz, updates the `matches` table, and broadcasts a `score_update` message.

### Files to Create / Modify
- `src/services/commentary.js` — update `publishEvent()`

### Requirements
```js
import { extractScoreUpdate, fetchScore } from '../adapters/cricbuzz.js';
import { matches } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export async function publishEvent(matchId, eventData) {
  const [saved] = await db.insert(commentary).values({ matchId, ...eventData }).returning();

  broadcastToMatch(matchId, {
    type: 'ball_event',
    timestamp: new Date().toISOString(),
    matchId,
    event: saved,
  });

  // Score update — only for scoring events
  const scoreDelta = extractScoreUpdate(eventData.rawBall ?? {});
  if (scoreDelta) {
    const match = await db.query.matches.findFirst({ where: eq(matches.id, matchId) });
    if (match?.cricbuzzMatchId) {
      const score = await fetchScore(match.cricbuzzMatchId);

      await db.update(matches).set({
        homeScore:    score.runs,
        homeWickets:  score.wickets,
        homeOvers:    score.overs,
      }).where(eq(matches.id, matchId));

      broadcastToMatch(matchId, {
        type: 'score_update',
        timestamp: new Date().toISOString(),
        matchId,
        score,
      });
    }
  }

  return saved;
}
```

### Key Gotchas
- The `score_update` broadcast must happen **after** `ball_event` — fans expect to see the ball description first, then the updated scoreline.
- `homeScore` / `homeWickets` are updated unconditionally when a scoring event occurs. In a second innings, the logic needs to differentiate home vs. away innings by checking `score.inningsNum`. Simplify for v1 by always updating `homeScore` and refining in a follow-up.
- Do NOT block `ball_event` delivery if `fetchScore` fails. Wrap the score update block in `try/catch` so a Cricbuzz score API error does not prevent the ball event from being delivered.

### References
- [websocket-protocol.md — score_update](../contracts/websocket-protocol.md#score_update) — exact message shape

---

## T046 — Include Live Score Fields in Match API Responses

### Overview
`GET /api/matches` and `GET /api/matches/:id` should include current score so clients can display a live scoreboard without subscribing via WebSocket.

### Files to Create / Modify
- `src/routes/matches.js` — verify score columns are selected (they should be automatically if using `db.select().from(matches)`)

### Requirements
Confirm that match row responses include:
- `homeScore`, `homeWickets`, `homeOvers`
- `awayScore`, `awayWickets`, `awayOvers`

These columns exist on the `matches` table (added in T005). As long as `db.select()` selects all columns, they are already included. No code change needed — this is a verification step.

### Testing
```bash
curl http://localhost:8000/api/matches/1
# Response should include:
# "homeScore": 156, "homeWickets": 4, "homeOvers": "16.3"
```

### References
- [rest-api.md — GET /api/matches response shape](../contracts/rest-api.md#get-apimatches)
