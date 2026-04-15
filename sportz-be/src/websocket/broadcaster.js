import { WebSocket } from 'ws';
import { getSubscribers } from './registry.js';

const droppedFrames = new Map(); // Map<matchId, number>

export function broadcastToMatch(matchId, payload) {
  const data = JSON.stringify(payload);
  for (const ws of getSubscribers(matchId)) {
    if (!safeSend(ws, data)) {
      droppedFrames.set(matchId, (droppedFrames.get(matchId) ?? 0) + 1);
    }
  }
}

// safeSend returns true if sent, false if dropped
function safeSend(ws, data) {
  if (ws.readyState !== WebSocket.OPEN) return false;
  if (ws.bufferedAmount > 16_384) return false; // drop frame for slow consumer
  ws.send(data);
  return true;
}

export function getDroppedFrames(matchId) {
  return droppedFrames.get(matchId) ?? 0;
}
