/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { WebSocketProvider } from './contexts/WebSocketContext';
import { Home } from './pages/Home';
import { MatchDetail } from './pages/MatchDetail';
import { GlobalWsStatus } from './components/GlobalWsStatus';

export default function App() {
  return (
    <WebSocketProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/match/:id" element={<MatchDetail />} />
        </Routes>
        <GlobalWsStatus />
      </Router>
    </WebSocketProvider>
  );
}
