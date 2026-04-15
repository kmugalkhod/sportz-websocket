import { describe, it, expect, jest } from '@jest/globals';

// With ESM + experimental-vm-modules, jest.unstable_mockModule must come before
// any dynamic import of the module under test.
jest.unstable_mockModule('../../src/db/db.js', () => ({
  db: { insert: jest.fn() },
}));

jest.unstable_mockModule('../../src/websocket/broadcaster.js', () => ({
  broadcastToMatch: jest.fn(),
}));

const { publishEvent } = await import('../../src/services/commentary.js');
const { db } = await import('../../src/db/db.js');

describe('publishEvent', () => {
  it('inserts event data with the correct matchId and returns the saved row', async () => {
    const fakeRow = { id: 1, matchId: 42, sequence: 1, message: 'Dot ball' };
    db.insert.mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([fakeRow]),
      }),
    });

    const result = await publishEvent(42, { message: 'Dot ball' });
    expect(result).toEqual(fakeRow);
    expect(db.insert).toHaveBeenCalled();
  });
});
