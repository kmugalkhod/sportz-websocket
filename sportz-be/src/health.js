import { Router } from 'express';
import { wss } from './index.js';
import { getActivePollerCount, getLastPollAt } from './adapters/cricbuzz.js';
import { pool } from './db/db.js';

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  let dbStatus = 'ok';
  try {
    await pool.query('SELECT 1');
  } catch {
    dbStatus = 'error';
  }

  res.status(dbStatus === 'error' ? 503 : 200).json({
    status: dbStatus === 'error' ? 'degraded' : 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    websocket: {
      connectedClients: wss.clients.size,
    },
    database: {
      status: dbStatus,
      poolSize: pool.totalCount,
      idleConnections: pool.idleCount,
    },
    cricbuzz: {
      activePollers: getActivePollerCount(),
      lastPollAt: getLastPollAt(),
    },
  });
});
