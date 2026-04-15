import { describe, it, expect, beforeEach } from '@jest/globals';
import { deduplicateBall, extractScoreUpdate } from '../../src/adapters/cricbuzz.js';

describe('deduplicateBall', () => {
  it('returns true for a new ball key', () => {
    expect(deduplicateBall(1, '15.4')).toBe(true);
  });

  it('returns false when the same ball key is seen again', () => {
    deduplicateBall(2, '16.1');
    expect(deduplicateBall(2, '16.1')).toBe(false);
  });

  it('isolates keys by matchId — same ball key on different matches are both new', () => {
    deduplicateBall(3, '1.1');
    expect(deduplicateBall(4, '1.1')).toBe(true);
  });
});

describe('extractScoreUpdate', () => {
  it('returns runs delta for a normal delivery', () => {
    const raw = { event: 'RUNS', runs: 1 };
    const result = extractScoreUpdate(raw);
    expect(result.runs).toBe(1);
    expect(result.wicketFell).toBe(false);
  });

  it('returns runs: 4 and no wicket for a boundary', () => {
    const raw = { event: 'BOUNDARY', runs: 4 };
    const result = extractScoreUpdate(raw);
    expect(result.runs).toBe(4);
    expect(result.wicketFell).toBe(false);
  });

  it('returns wicketFell: true for a wicket ball', () => {
    const raw = { event: 'WICKET', runs: 0 };
    expect(extractScoreUpdate(raw).wicketFell).toBe(true);
  });

  it('returns null for a dot ball with no score change', () => {
    const raw = { event: 'DOT_BALL', runs: 0 };
    expect(extractScoreUpdate(raw)).toBeNull();
  });
});
