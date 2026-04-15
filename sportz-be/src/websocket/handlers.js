import { db } from '../db/db.js';
import { matches, commentary } from '../db/schema.js';
import { eq, gt, and, asc } from 'drizzle-orm';
import * as registry from './registry.js';

export async function handleMessage(ws, rawData) {
  let msg;
  try {
    msg = JSON.parse(rawData.toString());
  } catch {
    ws.send(JSON.stringify({ type: 'error', code: 'INVALID_MESSAGE' }));
    return;
  }

  switch (msg.type) {
    case 'subscribe':
      await handleSubscribe(ws, msg);
      break;
    case 'unsubscribe':
      handleUnsubscribe(ws, msg);
      break;
    case 'ping':
      handlePing(ws);
      break;
    default:
      ws.send(JSON.stringify({ type: 'error', code: 'UNKNOWN_TYPE' }));
  }
}

async function handleSubscribe(ws, data) {
  const matchId = Number(data.matchId);
  if (!matchId) {
    ws.send(JSON.stringify({ type: 'error', code: 'INVALID_MATCH_ID' }));
    return;
  }

  const [match] = await db.select().from(matches).where(eq(matches.id, matchId));
  if (!match) {
    ws.send(JSON.stringify({ type: 'error', code: 'MATCH_NOT_FOUND' }));
    return;
  }

  registry.subscribe(ws, matchId);
  console.log(JSON.stringify({ level: 'info', message: 'ws_subscribe', connectionId: ws.connectionId, matchId, timestamp: new Date().toISOString() }));

  ws.send(
    JSON.stringify({
      type: 'subscribed',
      matchId,
      matchStatus: match.status,
      seriesName: match.seriesName,
      matchFormat: match.matchFormat,
    })
  );

  // Replay missed events if client provides lastSequence
  const lastSequence = Number(data.lastSequence ?? 0);
  if (lastSequence > 0) {
    const missed = await db
      .select()
      .from(commentary)
      .where(and(eq(commentary.matchId, matchId), gt(commentary.sequence, lastSequence)))
      .orderBy(asc(commentary.sequence));

    for (const event of missed) {
      ws.send(
        JSON.stringify({
          type: 'ball_event',
          timestamp: event.createdAt,
          matchId,
          event,
        })
      );
    }
  }
}

function handleUnsubscribe(ws, data) {
  const matchId = Number(data.matchId);
  registry.unsubscribe(ws, matchId);
  console.log(JSON.stringify({ level: 'info', message: 'ws_unsubscribe', connectionId: ws.connectionId, matchId, timestamp: new Date().toISOString() }));
  ws.send(JSON.stringify({ type: 'unsubscribed', matchId }));
}

function handlePing(ws) {
  ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
}
