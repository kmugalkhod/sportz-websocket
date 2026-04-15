import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { Match, CommentaryEvent, ScoreUpdate } from '../types';
import { fetchMatch, fetchMatchEvents } from '../lib/api';
import { useWebSocket } from '../contexts/WebSocketContext';
import ScoreHeader from '../components/ScoreHeader';
import BallStrip from '../components/BallStrip';
import OverProgress from '../components/OverProgress';
import CommentaryFeed from '../components/CommentaryFeed';
import { Skeleton } from '../components/ui/skeleton';

const MAX_EVENTS = 200;

export default function MatchDetail() {
  const { id } = useParams<{ id: string }>();
  const matchId = parseInt(id ?? '0', 10);

  const [match, setMatch] = useState<Match | null>(null);
  const [events, setEvents] = useState<CommentaryEvent[]>([]);
  const [liveScore, setLiveScore] = useState<ScoreUpdate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { isConnected, subscribe, unsubscribe, lastEvent, lastScoreUpdate } = useWebSocket();

  // Initial load
  const loadData = useCallback(async () => {
    try {
      const [matchData, eventsData] = await Promise.all([
        fetchMatch(matchId),
        fetchMatchEvents(matchId, 0, 100),
      ]);
      setMatch(matchData);
      setEvents(eventsData.events);
    } catch (err) {
      setError('Failed to load match data.');
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Subscribe / unsubscribe WebSocket
  useEffect(() => {
    if (!matchId) return;
    subscribe(matchId);
    return () => unsubscribe(matchId);
  }, [matchId, subscribe, unsubscribe]);

  // Live ball events
  useEffect(() => {
    if (!lastEvent || lastEvent.matchId !== matchId) return;
    setEvents(prev => {
      // Deduplicate by sequence
      if (prev.some(e => e.sequence === lastEvent.sequence)) return prev;
      const updated = [lastEvent, ...prev].slice(0, MAX_EVENTS);
      return updated;
    });
  }, [lastEvent, matchId]);

  // Live score updates
  useEffect(() => {
    if (!lastScoreUpdate || lastScoreUpdate.matchId !== matchId) return;
    setLiveScore(lastScoreUpdate.score);
  }, [lastScoreUpdate, matchId]);

  // ── Derived ────────────────────────────────────────────────────
  const currentOver =
    liveScore?.overs ??
    (match?.homeScore ? match.homeOvers : match?.awayOvers) ??
    '0.0';

  if (loading) return <LoadingSkeleton />;
  if (error || !match) return <ErrorState message={error ?? 'Match not found'} />;

  return (
    <div className="min-h-full">
      {/* Sticky score header */}
      <ScoreHeader match={match} liveScore={liveScore} isConnected={isConnected} />

      <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5">
        {/* Venue */}
        {match.venue && (
          <p className="text-xs text-slate-600 flex items-center gap-1">
            <MapPin size={11} />
            {match.venue}
          </p>
        )}

        {/* Over progress + Ball strip */}
        {match.status === 'live' && (
          <div className="glass-card p-4 space-y-4">
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-2 font-medium">This Over</p>
              <OverProgress events={events} currentOver={currentOver} />
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-2 font-medium">Recent Balls</p>
              <BallStrip events={events} />
            </div>
          </div>
        )}

        {/* Commentary */}
        <div>
          <p className="text-sm font-semibold text-slate-300 mb-3">Commentary</p>
          <CommentaryFeed events={events} />
        </div>
      </div>
    </div>
  );
}

// ─── Loading skeleton ──────────────────────────────────────────
function LoadingSkeleton() {
  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
      {/* Score header skeleton */}
      <div className="glass-card p-4 space-y-3">
        <div className="flex justify-between">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="flex justify-between items-center">
          <div className="space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-8 w-24" />
          </div>
          <Skeleton className="h-8 w-10" />
          <div className="space-y-2 items-end flex flex-col">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
      </div>

      {/* Ball strip skeleton */}
      <div className="glass-card p-4 space-y-2">
        <Skeleton className="h-3 w-20" />
        <div className="flex gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="w-8 h-8 rounded-full" />
          ))}
        </div>
      </div>

      {/* Commentary skeleton */}
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass-card p-4 space-y-2">
            <div className="flex gap-3">
              <Skeleton className="w-7 h-7 rounded-full shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-4 w-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-64 text-center p-6">
      <span className="text-4xl mb-3">⚠️</span>
      <p className="text-slate-300 font-medium">Something went wrong</p>
      <p className="text-slate-600 text-sm mt-1">{message}</p>
      <button
        onClick={() => window.location.reload()}
        className="mt-4 px-4 py-2 bg-[#00C853]/15 text-[#00C853] rounded-lg text-sm hover:bg-[#00C853]/25 transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
