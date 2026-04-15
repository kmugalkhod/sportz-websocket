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
  const subscriptionsRef = useRef<Map<number, number>>(new Map()); // matchId → lastSequence

  const connect = useCallback(() => {
    if (
      wsRef.current?.readyState === WebSocket.OPEN ||
      wsRef.current?.readyState === WebSocket.CONNECTING
    ) return;

    const ws = new WebSocket('ws://localhost:8000/ws');

    ws.onopen = () => {
      setIsConnected(true);
      reconnectAttemptsRef.current = 0;
      subscriptionsRef.current.forEach((lastSequence, matchId) => {
        ws.send(JSON.stringify({ type: 'subscribe', matchId, lastSequence }));
      });
    };

    ws.onmessage = (event) => {
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
      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
      reconnectAttemptsRef.current += 1;
      reconnectTimeoutRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => { /* onclose fires after onerror */ };

    wsRef.current = ws;
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      wsRef.current?.close();
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
