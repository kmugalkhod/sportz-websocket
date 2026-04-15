const registry = new Map(); // Map<matchId: number, Set<WebSocket>>

export function subscribe(ws, matchId) {
  if (!registry.has(matchId)) registry.set(matchId, new Set());
  registry.get(matchId).add(ws);
  ws.matchIds.add(matchId);
}

export function unsubscribe(ws, matchId) {
  const subs = registry.get(matchId);
  if (!subs) return;
  subs.delete(ws);
  if (subs.size === 0) registry.delete(matchId); // prune empty sets
  ws.matchIds.delete(matchId);
}

export function getSubscribers(matchId) {
  return registry.get(matchId) ?? new Set();
}
