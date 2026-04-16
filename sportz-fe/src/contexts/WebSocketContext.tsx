import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { CommentaryEvent, ScoreUpdate } from '../types';

interface WebSocketContextType {
  isConnected: boolean;
  subscribe: (matchId: number, lastSequence?: number) => void;
  unsubscribe: (matchId: number) => void;
  lastEvent: CommentaryEvent | null;
  lastScoreUpdate: { matchId: number; score: ScoreUpdate } | null;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export const useWebSocket = () => {
  const ctx = useContext(WebSocketContext);
  if (!ctx) throw new Error('useWebSocket must be used within WebSocketProvider');
  return ctx;
};

export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<CommentaryEvent | null>(null);
  const [lastScoreUpdate, setLastScoreUpdate] = useState<{ matchId: number; score: ScoreUpdate } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const subscriptionsRef = useRef<Map<number, number>>(new Map());
  // Guards against React Strict Mode double-invoke and stale closures
  const unmountedRef = useRef(false);

  const connect = useCallback(() => {
    if (unmountedRef.current) return;
    if (
      wsRef.current?.readyState === WebSocket.OPEN ||
      wsRef.current?.readyState === WebSocket.CONNECTING
    ) return;

    const ws = new WebSocket('ws://localhost:8000/ws');

    ws.onopen = () => {
      if (unmountedRef.current) { ws.close(); return; }
      setIsConnected(true);
      reconnectAttemptsRef.current = 0;
      subscriptionsRef.current.forEach((lastSequence, matchId) => {
        ws.send(JSON.stringify({ type: 'subscribe', matchId, lastSequence }));
      });
    };

    ws.onmessage = (event) => {
      if (unmountedRef.current) return;
      try {
        const data = JSON.parse(event.data as string);
        if (data.type === 'ball_event') {
          const e = data.event as CommentaryEvent;
          setLastEvent(e);
          if (e.matchId && e.sequence != null) {
            subscriptionsRef.current.set(e.matchId, e.sequence);
          }
        } else if (data.type === 'score_update') {
          setLastScoreUpdate({ matchId: data.matchId as number, score: data.score as ScoreUpdate });
        }
      } catch (err) {
        console.error('WS parse error', err);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      wsRef.current = null;
      // Don't reconnect if the component has unmounted (Strict Mode cleanup or real unmount)
      if (unmountedRef.current) return;
      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
      reconnectAttemptsRef.current += 1;
      reconnectTimeoutRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => { /* onclose fires after onerror */ };

    wsRef.current = ws;
  }, []);

  useEffect(() => {
    unmountedRef.current = false;

    // Defer by one macrotask so React 19 Strict Mode's synchronous
    // mount→unmount→remount cycle completes before we create the socket.
    // On the real (second) mount the timeout fires and the socket is created.
    // On the Strict Mode phantom mount the timeout is cancelled in cleanup
    // before it fires, so no socket is ever created for the phantom mount.
    const initTimeout = setTimeout(connect, 0);

    return () => {
      unmountedRef.current = true;
      clearTimeout(initTimeout);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);

      const ws = wsRef.current;
      wsRef.current = null;
      if (!ws) return;

      // Silence all handlers to prevent stale-closure side-effects
      ws.onopen    = null;
      ws.onmessage = null;
      ws.onerror   = null;
      ws.onclose   = null;

      // Only call close() on an already-open socket — avoids the
      // "closed before connection established" browser error
      if (ws.readyState === WebSocket.OPEN) ws.close();
    };
  }, [connect]);

  const subscribe = useCallback((matchId: number, lastSequence = 0) => {
    subscriptionsRef.current.set(matchId, lastSequence);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe', matchId, lastSequence }));
    }
  }, []);

  const unsubscribe = useCallback((matchId: number) => {
    subscriptionsRef.current.delete(matchId);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'unsubscribe', matchId }));
    }
  }, []);

  return (
    <WebSocketContext.Provider value={{ isConnected, subscribe, unsubscribe, lastEvent, lastScoreUpdate }}>
      {children}
    </WebSocketContext.Provider>
  );
};
