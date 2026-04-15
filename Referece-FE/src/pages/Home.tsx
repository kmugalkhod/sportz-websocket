import React, { useEffect, useState } from 'react';
import { Match, MatchStatus, MatchFormat } from '../types';
import { fetchMatches } from '../lib/api';
import { MatchCard } from '../components/MatchCard';
import { Activity } from 'lucide-react';

export const Home: React.FC = () => {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | MatchStatus | MatchFormat>('ALL');

  useEffect(() => {
    const loadMatches = async () => {
      try {
        const data = await fetchMatches();
        setMatches(data);
      } catch (err) {
        console.error('Failed to load matches', err);
      } finally {
        setLoading(false);
      }
    };

    loadMatches();
    const interval = setInterval(loadMatches, 30000);
    return () => clearInterval(interval);
  }, []);

  const filteredMatches = matches.filter(m => {
    if (filter === 'ALL') return true;
    if (['scheduled', 'live', 'finished'].includes(filter)) return m.status === filter;
    if (['T20', 'ODI', 'TEST'].includes(filter)) return m.matchFormat === filter;
    return true;
  });

  // Sort: Live first, then scheduled, then finished
  const sortedMatches = [...filteredMatches].sort((a, b) => {
    const statusOrder = { live: 0, scheduled: 1, finished: 2 };
    if (statusOrder[a.status] !== statusOrder[b.status]) {
      return statusOrder[a.status] - statusOrder[b.status];
    }
    return new Date(b.startTime).getTime() - new Date(a.startTime).getTime();
  });

  const filters = ['ALL', 'live', 'scheduled', 'finished', 'T20', 'ODI', 'TEST'];

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8 max-w-7xl mx-auto">
      <header className="flex items-center space-x-3 mb-8">
        <Activity className="w-8 h-8 text-green-500" />
        <h1 className="text-3xl font-bold tracking-tight">Sportz</h1>
      </header>

      <div className="flex space-x-2 overflow-x-auto pb-4 mb-6 scrollbar-hide">
        {filters.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f as any)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              filter === f 
                ? 'bg-primary text-primary-foreground' 
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            }`}
          >
            {f === 'live' ? 'LIVE' : f.toUpperCase()}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedMatches.map(match => (
            <MatchCard key={match.id} match={match} />
          ))}
          {sortedMatches.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              No matches found for this filter.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
