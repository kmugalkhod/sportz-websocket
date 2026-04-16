import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { healthRouter } from './health.js';
import { matchesRouter } from './routes/matches.js';
import { arcjetMiddleware, wsAj } from './middleware/arcjet.js';

export const app = express();
export const server = http.createServer(app);
export const wss = new WebSocketServer({ noServer: true });

// Allow the Vite dev server (and any local origin) to call this API
app.use(cors({
  origin: process.env.CORS_ORIGIN ?? '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use(healthRouter);
app.use('/api', arcjetMiddleware);
app.use('/api/matches', matchesRouter);

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

server.on('listening', async () => {
  const { setupWebSocket } = await import('./websocket/server.js');
  const { startHeartbeat } = await import('./websocket/heartbeat.js');
  const { startPollingAllLiveMatches, syncLiveMatches, startSyncInterval } = await import('./adapters/cricbuzz.js');
  setupWebSocket(server);
  startHeartbeat(wss);
  // Poll matches already in the DB
  await startPollingAllLiveMatches();
  // Auto-discover new live matches from Cricbuzz, then sync every 5 min
  await syncLiveMatches();
  startSyncInterval();
});

// Only bind the port when running as the main entry point — not when imported by tests
if (process.env.NODE_ENV !== 'test') {
  server.listen(process.env.PORT ?? 8000, () => {
    console.log(`Listening on port ${process.env.PORT ?? 8000}`);
  });
}
