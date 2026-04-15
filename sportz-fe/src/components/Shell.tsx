import { NavLink, Outlet } from 'react-router-dom';
import { Activity, Calendar, BarChart2, Wifi, WifiOff } from 'lucide-react';
import { useWebSocket } from '../contexts/WebSocketContext';
import { cn } from '../lib/utils';

const NAV_ITEMS = [
  { to: '/',          icon: Activity,  label: 'Live'      },
  { to: '/schedule',  icon: Calendar,  label: 'Schedule'  },
  { to: '/standings', icon: BarChart2, label: 'Standings' },
];

export default function Shell() {
  const { isConnected } = useWebSocket();

  return (
    <div className="flex flex-col min-h-dvh md:flex-row">
      {/* ── Desktop sidebar ──────────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-56 shrink-0 border-r border-white/[0.06] bg-[#0e1420] sticky top-0 h-screen">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-white/[0.06]">
          <CricketBallIcon />
          <span className="font-score text-xl font-bold tracking-wide text-white">SPORTZ</span>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-[#00C853]/15 text-[#00C853]'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                )
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* WS status */}
        <div className="px-5 py-4 border-t border-white/[0.06]">
          <div className="flex items-center gap-2 text-xs">
            {isConnected ? (
              <>
                <Wifi size={14} className="text-[#00C853]" />
                <span className="text-[#00C853]">Live</span>
              </>
            ) : (
              <>
                <WifiOff size={14} className="text-red-400" />
                <span className="text-red-400">Reconnecting…</span>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-dvh">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-[#0e1420] sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <CricketBallIcon />
            <span className="font-score text-lg font-bold tracking-wide text-white">SPORTZ</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            {isConnected ? (
              <><div className="w-2 h-2 rounded-full bg-[#00C853]" /><span className="text-[#00C853]">Live</span></>
            ) : (
              <><div className="w-2 h-2 rounded-full bg-red-400" /><span className="text-red-400">Offline</span></>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>

        {/* Mobile bottom tab bar */}
        <nav className="md:hidden flex border-t border-white/[0.06] bg-[#0e1420] sticky bottom-0 z-30">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors',
                  isActive ? 'text-[#00C853]' : 'text-slate-500 hover:text-slate-300'
                )
              }
            >
              <Icon size={20} />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}

function CricketBallIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="10" fill="#00C853" opacity="0.15" stroke="#00C853" strokeWidth="1.5"/>
      <circle cx="12" cy="12" r="10" stroke="#00C853" strokeWidth="1.5"/>
      <path d="M7 8.5C8.5 10 9 11 9 12S8.5 14 7 15.5" stroke="#00C853" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M17 8.5C15.5 10 15 11 15 12s.5 2 2 3.5" stroke="#00C853" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="2" y1="12" x2="22" y2="12" stroke="#00C853" strokeWidth="1" strokeDasharray="2 2"/>
    </svg>
  );
}
