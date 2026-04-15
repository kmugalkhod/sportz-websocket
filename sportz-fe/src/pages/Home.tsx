import { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { Match, MatchStatus, MatchFormat } from '../types';
import { fetchMatches } from '../lib/api';
import MatchCard from '../components/MatchCard';
import ScoreTicker from '../components/ScoreTicker';
import { Skeleton } from '../components/ui/skeleton';
import { cn } from '../lib/utils';

type FilterStatus = 'all' | MatchStatus;
type FilterFormat = 'all' | MatchFormat;

const STATUS_FILTERS: { label: string; value: FilterStatus }[] = [
  { label: 'All',       value: 'all'       },
  { label: 'Live',      value: 'live'      },
  { label: 'Upcoming',  value: 'scheduled' },
  { label: 'Finished',  value: 'finished'  },
];

const FORMAT_FILTERS: { label: string; value: FilterFormat }[] = [
  { label: 'All',  value: 'all'  },
  { label: 'T20',  value: 'T20'  },
  { label: 'ODI',  value: 'ODI'  },
  { label: 'TEST', value: 'TEST' },
];

const STATUS_ORDER: Record<MatchStatus, number> = { live: 0, scheduled: 1, finished: 2 };

function sortMatches(matches: Match[]): Match[] {
  return [...matches].sort((a, b) => {
    const statusDiff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (statusDiff !== 0) return statusDiff;
    return new Date(b.startTime).getTime() - new Date(a.startTime).getTime();
  });
}

export default function Home() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [formatFilter, setFormatFilter] = useState<FilterFormat>('all');

  const load = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    try {
      const data = await fetchMatches();
      setMatches(sortMatches(data));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(() => load(), 30000);
    return () => clearInterval(interval);
  }, [load]);

  const filtered = matches.filter(m => {
    if (statusFilter !== 'all' && m.status !== statusFilter) return false;
    if (formatFilter !== 'all' && m.matchFormat !== formatFilter) return false;
    return true;
  });

  return (
    <div className="flex flex-col min-h-full">
      {/* Score ticker for live matches */}
      <ScoreTicker matches={matches} />

      <div className="p-4 md:p-6 max-w-5xl mx-auto w-full flex-1">
        {/* Page header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-white">Matches</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {matches.filter(m => m.status === 'live').length} live now
            </p>
          </div>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
            aria-label="Refresh matches"
          >
            <RefreshCw size={16} className={cn(refreshing && 'animate-spin')} />
          </button>
        </div>

        {/* Filter bars */}
        <div className="space-y-2 mb-6">
          <FilterPills
            items={STATUS_FILTERS}
            active={statusFilter}
            onChange={v => setStatusFilter(v as FilterStatus)}
          />
          <FilterPills
            items={FORMAT_FILTERS}
            active={formatFilter}
            onChange={v => setFormatFilter(v as FilterFormat)}
          />
        </div>

        {/* Grid */}
        {loading ? (
          <SkeletonGrid />
        ) : filtered.length === 0 ? (
          <EmptyState statusFilter={statusFilter} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(m => <MatchCard key={m.id} match={m} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────

function FilterPills<T extends string>({
  items, active, onChange,
}: {
  items: { label: string; value: T }[];
  active: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1">
      {items.map(({ label, value }) => (
        <button
          key={value}
          onClick={() => onChange(value)}
          className={cn(
            'shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00C853]',
            active === value
              ? 'bg-[#00C853] text-black'
              : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200'
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="glass-card p-4 space-y-3">
          <div className="flex gap-2">
            <Skeleton className="h-5 w-12" />
            <Skeleton className="h-5 w-10" />
          </div>
          <Skeleton className="h-3 w-32" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ statusFilter }: { statusFilter: FilterStatus }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <span className="text-4xl mb-3">🏏</span>
      <p className="text-slate-300 font-medium">No matches found</p>
      <p className="text-slate-600 text-sm mt-1">
        {statusFilter === 'live' ? 'No live matches right now.' : 'Try a different filter.'}
      </p>
    </div>
  );
}
