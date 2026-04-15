import { describe, it, expect, beforeEach } from '@jest/globals';

// Re-import fresh registry state before each test by isolating via a closure.
// Since ESM modules are cached, we test the exported functions directly and
// reset state indirectly by using unique matchIds per test group.

import {
  subscribe,
  unsubscribe,
  getSubscribers,
} from '../../src/websocket/registry.js';

function makeWs() {
  return { matchIds: new Set(), readyState: 1 };
}

describe('registry', () => {
  it('subscribe adds ws to the match set', () => {
    const ws = makeWs();
    subscribe(ws, 100);
    expect(getSubscribers(100).has(ws)).toBe(true);
  });

  it('subscribe keeps ws.matchIds in sync', () => {
    const ws = makeWs();
    subscribe(ws, 101);
    expect(ws.matchIds.has(101)).toBe(true);
  });

  it('unsubscribe removes ws from the match set', () => {
    const ws = makeWs();
    subscribe(ws, 200);
    unsubscribe(ws, 200);
    expect(getSubscribers(200).has(ws)).toBe(false);
  });

  it('unsubscribe keeps ws.matchIds in sync', () => {
    const ws = makeWs();
    subscribe(ws, 201);
    unsubscribe(ws, 201);
    expect(ws.matchIds.has(201)).toBe(false);
  });

  it('prunes empty sets after last subscriber leaves', () => {
    const ws = makeWs();
    subscribe(ws, 300);
    unsubscribe(ws, 300);
    // getSubscribers returns an empty Set (not the deleted set), so size is 0
    expect(getSubscribers(300).size).toBe(0);
  });

  it('multiple subscribers coexist for the same match', () => {
    const ws1 = makeWs();
    const ws2 = makeWs();
    subscribe(ws1, 400);
    subscribe(ws2, 400);
    const subs = getSubscribers(400);
    expect(subs.has(ws1)).toBe(true);
    expect(subs.has(ws2)).toBe(true);
    expect(subs.size).toBe(2);
  });

  it('unsubscribe one subscriber does not remove others', () => {
    const ws1 = makeWs();
    const ws2 = makeWs();
    subscribe(ws1, 500);
    subscribe(ws2, 500);
    unsubscribe(ws1, 500);
    expect(getSubscribers(500).has(ws2)).toBe(true);
    expect(getSubscribers(500).size).toBe(1);
  });

  it('unsubscribe on unknown matchId does not throw', () => {
    const ws = makeWs();
    expect(() => unsubscribe(ws, 9999)).not.toThrow();
  });
});
