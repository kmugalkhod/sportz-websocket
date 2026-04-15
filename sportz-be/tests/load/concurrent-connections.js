/**
 * T047 — 1,000-Client Load Test
 *
 * Run manually (server must be running first):
 *   npm run dev          # in one terminal
 *   ulimit -n 10000      # macOS: raise file descriptor limit
 *   node tests/load/concurrent-connections.js
 */

import WebSocket from 'ws';
import { publishEvent } from '../../src/services/commentary.js';

const CLIENTS = 1_000;
const EVENTS = 10;
const MATCH_ID = 1;

const received = new Array(CLIENTS).fill(0);
const clients = [];

// Open all connections
for (let i = 0; i < CLIENTS; i++) {
  const ws = new WebSocket('ws://localhost:8000/ws');
  ws.on('open', () => {
    ws.send(JSON.stringify({ type: 'subscribe', matchId: MATCH_ID }));
  });
  ws.on('message', (data) => {
    const msg = JSON.parse(data);
    if (msg.type === 'ball_event') received[i]++;
  });
  clients.push(ws);
}

// Wait for all connections to open, then publish events
await new Promise(r => setTimeout(r, 2000));

for (let e = 0; e < EVENTS; e++) {
  await publishEvent(MATCH_ID, { message: `Test ball ${e}`, eventType: 'ball', sequence: e });
  await new Promise(r => setTimeout(r, 100));
}

await new Promise(r => setTimeout(r, 2000));
clients.forEach(ws => ws.close());

const allReceived = received.every(count => count === EVENTS);
console.log(allReceived
  ? 'PASS — all clients received all events'
  : `FAIL — ${received.filter(c => c < EVENTS).length} clients missed events`);
process.exit(allReceived ? 0 : 1);
