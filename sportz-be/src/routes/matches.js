import { Router } from 'express';
import { db } from '../db/db.js';
import { matches } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { eventsRouter } from './events.js';

export const matchesRouter = Router();

matchesRouter.use('/:id/events', eventsRouter);

// GET /api/matches?status=live&format=T20
matchesRouter.get('/', async (req, res) => {
  try {
    let query = db.select().from(matches);

    const conditions = [];
    if (req.query.status) conditions.push(eq(matches.status, req.query.status));
    if (req.query.format) conditions.push(eq(matches.matchFormat, req.query.format));

    if (conditions.length === 1) {
      query = query.where(conditions[0]);
    } else if (conditions.length > 1) {
      const { and } = await import('drizzle-orm');
      query = query.where(and(...conditions));
    }

    const rows = await query;
    res.json({ matches: rows });
  } catch (err) {
    console.error('GET /api/matches error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/matches/:id
matchesRouter.get('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid match id' });

    const [match] = await db.select().from(matches).where(eq(matches.id, id));
    if (!match) return res.status(404).json({ error: 'Match not found' });

    res.json(match);
  } catch (err) {
    console.error('GET /api/matches/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
