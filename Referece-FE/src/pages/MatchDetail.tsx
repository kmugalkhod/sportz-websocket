import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Match, CommentaryEvent, ScoreUpdate } from '../types';
import { fetchMatch, fetchMatchEvents } from '../lib/api';
import { useWebSocket } from '../contexts/WebSocketContext';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { ArrowLeft, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const MatchDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const matchId = parseInt(id || '0', 10);
  const navigate = useNavigate();
  const { isConnected, subscribe, unsubscribe, lastEvent, lastScoreUpdate } = useWebSocket();

  const [match, setMatch] = useState<Match | null>(null);
  const [events, setEvents] = useState<CommentaryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const lastSequenceRef = useRef<number>(0);

  useEffect(() => {
    if (!matchId) return;

    const loadData = async () => {
      try {
        const matchData = await fetchMatch(matchId);
        setMatch(matchData);

        const eventsData = await fetchMatchEvents(matchId, 0, 100);
        setEvents(eventsData.events.reverse()); // newest first
        lastSequenceRef.current = eventsData.lastSequence;

        subscribe(matchId, eventsData.lastSequence);
      } catch (err) {
        console.error('Failed to load match data', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();

    return () => {
      unsubscribe(matchId);
    };
  }, [matchId, subscribe, unsubscribe]);

  // Handle new WS events
  useEffect(() => {
    if (lastEvent && lastEvent.matchId === matchId) {
      setEvents(prev => {
        // Prevent duplicates
        if (prev.some(e => e.id === lastEvent.id)) return prev;
        return [lastEvent, ...prev];
      });
      lastSequenceRef.current = lastEvent.sequence;
    }
  }, [lastEvent, matchId]);

  // Handle score updates
  useEffect(() => {
    if (lastScoreUpdate && lastScoreUpdate.matchId === matchId && match) {
      setMatch(prev => {
        if (!prev) return prev;
        const isHome = lastScoreUpdate.score.battingTeam === prev.homeTeam;
        return {
          ...prev,
          ...(isHome 
            ? { homeScore: lastScoreUpdate.score.runs, homeWickets: lastScoreUpdate.score.wickets, homeOvers: lastScoreUpdate.score.overs }
            : { awayScore: lastScoreUpdate.score.runs, awayWickets: lastScoreUpdate.score.wickets, awayOvers: lastScoreUpdate.score.overs }
          )
        };
      });
    }
  }, [lastScoreUpdate, matchId]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-background text-foreground">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!match) {
    return <div className="p-8 text-center bg-background text-foreground min-h-screen">Match not found</div>;
  }

  // Get last 6 balls for wagon wheel, clearing on innings start/end
  const mostRecentInningsBoundaryIndex = events.findIndex(e => ['innings_start', 'innings_end', 'match_start'].includes(e.eventType));
  
  const eventsForWagonWheel = mostRecentInningsBoundaryIndex !== -1 
    ? events.slice(0, mostRecentInningsBoundaryIndex) 
    : events;

  const last6Balls = eventsForWagonWheel
    .filter(e => ['ball', 'boundary_four', 'boundary_six', 'wicket', 'wide', 'no_ball', 'dot_ball'].includes(e.eventType))
    .slice(0, 6)
    .reverse();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-card/90 backdrop-blur border-b">
        <div className="max-w-3xl mx-auto p-4">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => navigate(-1)} className="p-2 -ml-2 hover:bg-secondary rounded-full transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center space-x-2 text-xs font-medium">
              {isConnected ? (
                <span className="flex items-center text-green-500"><Wifi className="w-3 h-3 mr-1" /> Connected</span>
              ) : (
                <span className="flex items-center text-yellow-500"><RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Reconnecting</span>
              )}
            </div>
          </div>

          <div className="text-center mb-2">
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
              {match.seriesName} • {match.venue}
            </div>
            <div className="flex justify-center items-center space-x-2 mb-4">
              {match.status === 'live' && (
                <Badge variant="live" className="animate-pulse">LIVE</Badge>
              )}
              {match.matchFormat && <Badge variant="outline">{match.matchFormat}</Badge>}
            </div>
          </div>

          <div className="flex justify-between items-center px-4">
            <div className="text-center flex-1">
              <div className="text-xl font-bold">{match.homeTeam}</div>
              <div className="font-mono text-2xl font-bold mt-1">
                {match.homeScore}/{match.homeWickets}
              </div>
              <div className="text-sm text-muted-foreground font-mono">({match.homeOvers} ov)</div>
            </div>
            <div className="text-center px-4 flex flex-col items-center">
              <div className="text-muted-foreground font-medium text-sm mb-1">VS</div>
              {lastScoreUpdate?.matchId === match.id && lastScoreUpdate.score.runRate > 0 && (
                <div className="text-xs text-muted-foreground whitespace-nowrap">
                  CRR: <span className="font-mono text-foreground">{lastScoreUpdate.score.runRate.toFixed(2)}</span>
                </div>
              )}
            </div>
            <div className="text-center flex-1">
              <div className="text-xl font-bold">{match.awayTeam}</div>
              <div className="font-mono text-2xl font-bold mt-1">
                {match.awayScore}/{match.awayWickets}
              </div>
              <div className="text-sm text-muted-foreground font-mono">({match.awayOvers} ov)</div>
            </div>
          </div>

          {/* Last 6 balls strip */}
          <div className="mt-6 flex items-center justify-center space-x-2">
            <span className="text-xs text-muted-foreground mr-2">Recent:</span>
            <div className="flex space-x-1.5">
              {last6Balls.map(ball => (
                <div key={ball.id} className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold font-mono bg-secondary text-secondary-foreground border border-border">
                  {ball.eventType === 'wicket' ? 'W' : 
                   ball.eventType === 'boundary_four' ? '4' : 
                   ball.eventType === 'boundary_six' ? '6' : 
                   ball.eventType === 'dot_ball' ? '•' : 
                   ball.eventType === 'wide' ? 'Wd' : 
                   ball.eventType === 'no_ball' ? 'Nb' : 
                   ball.metadata?.runs}
                </div>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Commentary Feed */}
      <main className="flex-1 max-w-3xl w-full mx-auto p-4 space-y-4">
        <AnimatePresence initial={false}>
          {events.map((event) => (
            <CommentaryRow key={event.id} event={event} />
          ))}
        </AnimatePresence>
      </main>
    </div>
  );
};

const CommentaryRow: React.FC<{ event: CommentaryEvent }> = ({ event }) => {
  const isAnnouncement = ['innings_start', 'innings_end', 'match_start', 'match_end', 'rain_delay'].includes(event.eventType);
  const isOverComplete = event.eventType === 'over_complete';

  if (isAnnouncement) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full py-3 px-4 bg-primary/10 text-primary border border-primary/20 rounded-lg text-center font-medium my-6"
      >
        {event.message}
      </motion.div>
    );
  }

  if (isOverComplete) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full py-4 border-y border-border my-6 bg-secondary/30"
      >
        <div className="flex justify-between items-center px-4">
          <div className="font-bold">End of Over {event.minute}</div>
          <div className="text-sm text-muted-foreground">{event.message}</div>
        </div>
      </motion.div>
    );
  }

  const getBadgeStyle = (type: string) => {
    switch (type) {
      case 'boundary_four': return 'bg-blue-500 text-white border-blue-600';
      case 'boundary_six': return 'bg-purple-600 text-white border-purple-700';
      case 'wicket': return 'bg-red-600 text-white border-red-700';
      case 'wide':
      case 'no_ball': return 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30';
      case 'dot_ball': return 'bg-secondary text-secondary-foreground border-border';
      default: return 'bg-secondary text-secondary-foreground border-border';
    }
  };

  const getBadgeText = (event: CommentaryEvent) => {
    switch (event.eventType) {
      case 'boundary_four': return '4';
      case 'boundary_six': return '6';
      case 'wicket': return 'W';
      case 'wide': return 'Wd';
      case 'no_ball': return 'Nb';
      case 'dot_ball': return '•';
      case 'review': return 'DRS';
      default: return event.metadata?.runs?.toString() || '-';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex space-x-4 p-3 rounded-lg transition-colors ${event.eventType === 'wicket' ? 'bg-red-500/10 border border-red-500/20' : 'hover:bg-secondary/50'}`}
    >
      <div className="flex flex-col items-center min-w-[3rem]">
        <div className="text-sm font-mono text-muted-foreground mb-1">{event.metadata?.over}</div>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold font-mono border shadow-sm ${getBadgeStyle(event.eventType)}`}>
          {getBadgeText(event)}
        </div>
      </div>
      <div className="flex-1 pt-1">
        <div className="text-sm mb-1">
          <span className="font-semibold">{event.metadata?.bowler}</span> to <span className="font-semibold">{event.actor}</span>
        </div>
        <p className="text-sm leading-relaxed text-foreground/90">{event.message}</p>
      </div>
    </motion.div>
  );
};
