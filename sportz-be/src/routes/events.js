import { Router } from 'express';
import { db } from '../db/db.js';
import { commentary } from '../db/schema.js';
import { eq, gt, and, asc, sql } from 'drizzle-orm';

export const eventsRouter = Router({ mergeParams: true });

// GET /api/matches/:id/events?after=N&limit=100
eventsRouter.get('/', async (req, res) => {
  try {
    const matchId = Number(req.params.id);
    if (!matchId) return res.status(400).json({ error: 'Invalid match id' });

    const after = Number(req.query.after ?? 0);
    const limit = Math.min(Number(req.query.limit ?? 100), 500);

    const conditions = [eq(commentary.matchId, matchId)];
    if (after > 0) conditions.push(gt(commentary.sequence, after));

    const events = await db
      .select()
      .from(commentary)
      .where(and(...conditions))
      .orderBy(asc(commentary.sequence))
      .limit(limit);

    const [{ count }] = await db
      .select({ count: sql`count(*)`.mapWith(Number) })
      .from(commentary)
      .where(eq(commentary.matchId, matchId));

    const lastSequence = events.length > 0 ? events[events.length - 1].sequence : after;

    res.json({ events, total: count, lastSequence });
  } catch (err) {
    console.error('GET /api/matches/:id/events error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
