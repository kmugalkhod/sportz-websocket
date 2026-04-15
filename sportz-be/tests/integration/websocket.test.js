import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { WebSocket } from 'ws';

// Mock heavy dependencies before importing the server
jest.unstable_mockModule('../../src/db/db.js', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
  },
  pool: { query: jest.fn() },
}));

jest.unstable_mockModule('../../src/adapters/cricbuzz.js', () => ({
  startPollingAllLiveMatches: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('@arcjet/node', () => ({
  default: jest.fn(() => ({
    protect: jest.fn().mockResolvedValue({ isDenied: () => false }),
    withRule: jest.fn().mockReturnThis(),
  })),
  shield: jest.fn(),
  detectBot: jest.fn(),
  slidingWindow: jest.fn(),
}));

jest.unstable_mockModule('../../src/websocket/handlers.js', () => ({
  handleMessage: jest.fn(async (ws, rawData) => {
    let msg;
    try {
      msg = JSON.parse(rawData.toString());
    } catch {
      ws.send(JSON.stringify({ type: 'error', code: 'INVALID_MESSAGE' }));
      return;
    }
    if (msg.type === 'subscribe') {
      ws.send(JSON.stringify({ type: 'subscribed', matchId: msg.matchId }));
    } else if (msg.type === 'unsubscribe') {
      ws.send(JSON.stringify({ type: 'unsubscribed', matchId: msg.matchId }));
    } else if (msg.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
    }
  }),
}));

const { server } = await import('../../src/index.js');

const TEST_PORT = 18765;

function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws`);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

function nextMessage(ws) {
  return new Promise((resolve) => {
    ws.once('message', (data) => resolve(JSON.parse(data.toString())));
  });
}

beforeAll(async () => {
  await new Promise((resolve) => server.listen(TEST_PORT, resolve));
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe('WebSocket protocol', () => {
  it('subscribe message → receives { type: "subscribed", matchId }', async () => {
    const ws = await connect();
    const reply = nextMessage(ws);
    ws.send(JSON.stringify({ type: 'subscribe', matchId: 1 }));
    const msg = await reply;
    expect(msg.type).toBe('subscribed');
    expect(msg.matchId).toBe(1);
    ws.close();
  });

  it('unsubscribe message → receives { type: "unsubscribed", matchId }', async () => {
    const ws = await connect();
    // subscribe first so there's something to unsubscribe from
    ws.send(JSON.stringify({ type: 'subscribe', matchId: 1 }));
    await nextMessage(ws);

    const reply = nextMessage(ws);
    ws.send(JSON.stringify({ type: 'unsubscribe', matchId: 1 }));
    const msg = await reply;
    expect(msg.type).toBe('unsubscribed');
    expect(msg.matchId).toBe(1);
    ws.close();
  });

  it('ping message → receives { type: "pong" }', async () => {
    const ws = await connect();
    const reply = nextMessage(ws);
    ws.send(JSON.stringify({ type: 'ping' }));
    const msg = await reply;
    expect(msg.type).toBe('pong');
    expect(typeof msg.timestamp).toBe('number');
    ws.close();
  });

  it('invalid JSON → receives { type: "error", code: "INVALID_MESSAGE" }', async () => {
    const ws = await connect();
    const reply = nextMessage(ws);
    ws.send('not-json{{');
    const msg = await reply;
    expect(msg.type).toBe('error');
    expect(msg.code).toBe('INVALID_MESSAGE');
    ws.close();
  });
});
