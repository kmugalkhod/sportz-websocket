import { useNavigate } from 'react-router-dom';
import { MapPin, Clock } from 'lucide-react';
import { Match } from '../types';
import { Badge } from './ui/badge';
import { getTeamFlag } from '../lib/teamFlags';
import { formatMatchTime } from '../lib/utils';
import { cn } from '../lib/utils';

interface Props { match: Match }

const STRIPE_COLOR: Record<string, string> = {
  live:      'bg-[#00C853]',
  scheduled: 'bg-slate-600',
  finished:  'bg-zinc-700',
};

export default function MatchCard({ match }: Props) {
  const navigate = useNavigate();
  const isLive = match.status === 'live';
  const hasStarted = match.status !== 'scheduled';

  return (
    <button
      onClick={() => navigate(`/match/${match.id}`)}
      className="group w-full text-left glass-card hover:bg-[#1a2540] hover:border-[#00C853]/20 transition-all duration-200 flex overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00C853] rounded-xl"
      aria-label={`${match.homeTeam} vs ${match.awayTeam} — ${match.status}`}
    >
      {/* Left colour stripe */}
      <div className={cn('w-1 shrink-0 rounded-l-xl', STRIPE_COLOR[match.status])} />

      <div className="flex-1 p-4">
        {/* Header row */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            {isLive ? (
              <Badge variant="live" className="gap-1.5">
                <span className="live-dot" />
                LIVE
              </Badge>
            ) : match.status === 'scheduled' ? (
              <Badge variant="scheduled">UPCOMING</Badge>
            ) : (
              <Badge variant="finished">FINAL</Badge>
            )}
            {match.matchFormat && (
              <Badge variant="format">{match.matchFormat}</Badge>
            )}
          </div>
          <span className="text-xs text-slate-500 flex items-center gap-1 shrink-0">
            <Clock size={11} />
            {formatMatchTime(match.startTime)}
          </span>
        </div>

        {/* Series name */}
        {match.seriesName && (
          <p className="text-xs text-slate-500 mb-2 truncate">{match.seriesName}</p>
        )}

        {/* Teams + Scores */}
        <div className="space-y-2">
          <TeamRow
            team={match.homeTeam}
            runs={match.homeScore}
            wickets={match.homeWickets}
            overs={match.homeOvers}
            hasStarted={hasStarted}
            isBatting={isLive}
          />
          <TeamRow
            team={match.awayTeam}
            runs={match.awayScore}
            wickets={match.awayWickets}
            overs={match.awayOvers}
            hasStarted={hasStarted}
            isBatting={false}
          />
        </div>

        {/* Venue */}
        {match.venue && (
          <p className="mt-3 text-xs text-slate-600 flex items-center gap-1 truncate">
            <MapPin size={11} />
            {match.venue}
          </p>
        )}
      </div>
    </button>
  );
}

function TeamRow({
  team, runs, wickets, overs, hasStarted, isBatting,
}: {
  team: string;
  runs: number;
  wickets: number;
  overs: string;
  hasStarted: boolean;
  isBatting: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-base leading-none">{getTeamFlag(team)}</span>
        <span className={cn('text-sm font-semibold', isBatting ? 'text-white' : 'text-slate-400')}>
          {team}
        </span>
      </div>
      {hasStarted ? (
        <div className="flex items-baseline gap-1.5">
          <span className="font-score text-lg font-bold text-white leading-none">
            {runs}/{wickets}
          </span>
          <span className="text-xs text-slate-500">({overs})</span>
        </div>
      ) : (
        <span className="text-slate-600 text-sm">—</span>
      )}
    </div>
  );
}
