import { randomUUID } from 'crypto';
import { wss } from '../index.js';
import { handleMessage } from './handlers.js';
import { unsubscribe } from './registry.js';

const MAX_CONNECTIONS = parseInt(process.env.MAX_CONNECTIONS ?? '10000', 10);

export function setupWebSocket(_server) {
  wss.on('connection', (ws, req) => {
    if (wss.clients.size > MAX_CONNECTIONS) {
      ws.send(JSON.stringify({ type: 'error', code: 'SERVER_FULL', message: 'Connection limit reached' }));
      ws.close();
      return;
    }

    ws.connectionId = randomUUID();
    ws.connectedAt = Date.now();
    ws.isAlive = true;
    ws.matchIds = new Set();

    console.log(JSON.stringify({
      level: 'info', message: 'ws_connect',
      connectionId: ws.connectionId,
      ip: req.headers['x-forwarded-for'] ?? req.socket.remoteAddress,
      timestamp: new Date().toISOString(),
    }));

    ws.on('message', (data) => handleMessage(ws, data));

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('close', () => {
      console.log(JSON.stringify({
        level: 'info', message: 'ws_disconnect',
        connectionId: ws.connectionId,
        durationMs: Date.now() - ws.connectedAt,
        subscriptions: [...ws.matchIds],
        timestamp: new Date().toISOString(),
      }));
      ws.matchIds.forEach((id) => unsubscribe(ws, id));
      ws.matchIds.clear();
    });

    ws.on('error', (err) => {
      console.error(JSON.stringify({ level: 'error', message: 'ws_error', connectionId: ws.connectionId, error: err.message, timestamp: new Date().toISOString() }));
      ws.terminate(); // triggers 'close' event, which runs cleanup
    });
  });
}
