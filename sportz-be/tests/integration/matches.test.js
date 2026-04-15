import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';

// Mock ArcJet before importing the app — share a single instance so tests can configure protect()
const mockAjInstance = {
  protect: jest.fn().mockResolvedValue({ isDenied: () => false }),
  withRule: jest.fn().mockReturnThis(),
};
jest.unstable_mockModule('@arcjet/node', () => ({
  default: jest.fn(() => mockAjInstance),
  shield: jest.fn(),
  detectBot: jest.fn(),
  slidingWindow: jest.fn(),
}));

jest.unstable_mockModule('../../src/db/db.js', () => {
  const chain = { from: jest.fn(), where: jest.fn(), then: undefined };
  chain.from.mockReturnValue({ ...chain, then: (fn) => Promise.resolve([]).then(fn) });
  chain.where.mockReturnValue({ then: (fn) => Promise.resolve([]).then(fn) });
  return {
    db: { select: jest.fn().mockReturnValue(chain), insert: jest.fn() },
    pool: { query: jest.fn() },
  };
});

jest.unstable_mockModule('../../src/adapters/cricbuzz.js', () => ({
  startPollingAllLiveMatches: jest.fn().mockResolvedValue(undefined),
}));

const { app } = await import('../../src/index.js');

describe('ArcJet middleware', () => {
  it('allows normal GET /api/matches', async () => {
    const res = await request(app).get('/api/matches');
    expect(res.status).toBe(200);
  });

  it('returns 429 when ArcJet denies request', async () => {
    mockAjInstance.protect.mockResolvedValueOnce({
      isDenied: () => true,
      reason: { isBot: () => false, isRateLimit: () => true },
    });

    const res = await request(app).get('/api/matches');
    expect(res.status).toBe(429);
  });
});
