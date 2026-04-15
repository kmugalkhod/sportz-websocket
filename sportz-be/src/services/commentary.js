import { db } from '../db/db.js';
import { commentary, matches } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { broadcastToMatch } from '../websocket/broadcaster.js';
import { extractScoreUpdate, fetchScore } from '../adapters/cricbuzz.js';

export async function publishEvent(matchId, eventData) {
  // Strip rawBall — it is not a DB column; used only for score delta detection
  const { rawBall, ...insertData } = eventData;

  const [saved] = await db
    .insert(commentary)
    .values({ matchId, ...insertData })
    .returning();

  broadcastToMatch(matchId, {
    type: 'ball_event',
    timestamp: new Date().toISOString(),
    matchId,
    event: saved,
  });

  // Score update — only for scoring events; never blocks ball_event delivery
  const scoreDelta = extractScoreUpdate(rawBall ?? {});
  if (scoreDelta) {
    try {
      const match = await db.query.matches.findFirst({ where: eq(matches.id, matchId) });
      if (match?.cricbuzzMatchId) {
        const score = await fetchScore(match.cricbuzzMatchId);

        await db.update(matches).set({
          homeScore:   score.runs,
          homeWickets: score.wickets,
          homeOvers:   score.overs,
        }).where(eq(matches.id, matchId));

        broadcastToMatch(matchId, {
          type: 'score_update',
          timestamp: new Date().toISOString(),
          matchId,
          score,
        });
      }
    } catch (err) {
      console.error(JSON.stringify({
        level: 'error',
        message: 'Score update failed',
        matchId,
        err: err.message,
        timestamp: new Date().toISOString(),
      }));
    }
  }

  return saved;
}
