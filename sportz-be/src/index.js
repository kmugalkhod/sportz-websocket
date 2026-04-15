import 'dotenv/config';
import http from 'http';
import express from 'express';
import { WebSocketServer } from 'ws';
import { healthRouter } from './health.js';
import { matchesRouter } from './routes/matches.js';
import { arcjetMiddleware, wsAj } from './middleware/arcjet.js';

export const app = express();
export const server = http.createServer(app);
export const wss = new WebSocketServer({ noServer: true });

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
  const { startPollingAllLiveMatches } = await import('./adapters/cricbuzz.js');
  setupWebSocket(server);
  startHeartbeat(wss);
  await startPollingAllLiveMatches();
});

// Only bind the port when running as the main entry point — not when imported by tests
if (process.env.NODE_ENV !== 'test') {
  server.listen(process.env.PORT ?? 8000, () => {
    console.log(`Listening on port ${process.env.PORT ?? 8000}`);
  });
}
