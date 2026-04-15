import React from 'react';
import { useWebSocket } from '../contexts/WebSocketContext';
import { WifiOff } from 'lucide-react';

export const GlobalWsStatus: React.FC = () => {
  const { isConnected } = useWebSocket();

  if (isConnected) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-destructive text-destructive-foreground p-2 text-center text-sm font-medium flex items-center justify-center z-50">
      <WifiOff className="w-4 h-4 mr-2" />
      Disconnected from live server. Reconnecting...
    </div>
  );
};
