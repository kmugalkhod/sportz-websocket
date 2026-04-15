import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock the wss import before importing heartbeat
const mockWss = { clients: new Set(), on: jest.fn() };
jest.mock('../../src/index.js', () => ({ wss: mockWss }));

import { startHeartbeat } from '../../src/websocket/heartbeat.js';

describe('startHeartbeat', () => {
  beforeEach(() => {
    mockWss.clients.clear();
    mockWss.on.mockClear();
  });

  it('terminates a client that did not pong', () => {
    const ws = { isAlive: false, terminate: jest.fn(), ping: jest.fn(), on: jest.fn() };
    mockWss.clients.add(ws);

    jest.useFakeTimers();
    startHeartbeat(mockWss);
    jest.advanceTimersByTime(15_001);

    expect(ws.terminate).toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('does not terminate a client that ponged', () => {
    const ws = { isAlive: true, terminate: jest.fn(), ping: jest.fn(), on: jest.fn() };
    mockWss.clients.add(ws);

    jest.useFakeTimers();
    startHeartbeat(mockWss);
    jest.advanceTimersByTime(15_001);

    expect(ws.terminate).not.toHaveBeenCalled();
    jest.useRealTimers();
  });
});
