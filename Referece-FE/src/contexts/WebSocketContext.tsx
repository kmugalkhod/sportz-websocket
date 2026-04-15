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
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};

export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<CommentaryEvent | null>(null);
  const [lastScoreUpdate, setLastScoreUpdate] = useState<{ matchId: number; score: ScoreUpdate } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const subscriptionsRef = useRef<Map<number, number>>(new Map()); // matchId -> lastSequence

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    const ws = new WebSocket('ws://localhost:8000/ws');

    ws.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      reconnectAttemptsRef.current = 0;
      
      // Resubscribe to all active subscriptions
      subscriptionsRef.current.forEach((lastSequence, matchId) => {
        ws.send(JSON.stringify({ type: 'subscribe', matchId, lastSequence }));
      });
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'ball_event') {
          setLastEvent(data.event);
          // Update last sequence for this match
          if (data.event.matchId && data.event.sequence) {
            subscriptionsRef.current.set(data.event.matchId, data.event.sequence);
          }
        } else if (data.type === 'score_update') {
          setLastScoreUpdate({ matchId: data.matchId, score: data.score });
        } else if (data.type === 'pong') {
          // Handle pong if needed
        }
      } catch (err) {
        console.error('Failed to parse WS message', err);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
      wsRef.current = null;
      
      // Exponential backoff reconnect
      const timeout = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
      reconnectAttemptsRef.current += 1;
      reconnectTimeoutRef.current = setTimeout(connect, timeout);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error', error);
      // onclose will be called after onerror usually
    };

    wsRef.current = ws;
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  const subscribe = useCallback((matchId: number, lastSequence: number = 0) => {
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
