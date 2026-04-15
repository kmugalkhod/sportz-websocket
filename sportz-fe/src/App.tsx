import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { WebSocketProvider } from './contexts/WebSocketContext';
import Shell from './components/Shell';
import Home from './pages/Home';
import MatchDetail from './pages/MatchDetail';
import Schedule from './pages/Schedule';
import Standings from './pages/Standings';

export default function App() {
  return (
    <BrowserRouter>
      <WebSocketProvider>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Home />} />
            <Route path="/match/:id" element={<MatchDetail />} />
            <Route path="/schedule" element={<Schedule />} />
            <Route path="/standings" element={<Standings />} />
          </Route>
        </Routes>
      </WebSocketProvider>
    </BrowserRouter>
  );
}
