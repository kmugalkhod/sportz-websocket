import { ArrowLeft, Wifi, WifiOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Match, ScoreUpdate } from '../types';
import { Badge } from './ui/badge';
import { getTeamFlag } from '../lib/teamFlags';
import { cn } from '../lib/utils';

interface Props {
  match: Match;
  liveScore: ScoreUpdate | null;
  isConnected: boolean;
}

export default function ScoreHeader({ match, liveScore, isConnected }: Props) {
  const navigate = useNavigate();
  const isLive = match.status === 'live';

  // Determine which team is currently batting
  const battingTeam = liveScore?.battingTeam ?? null;
  const homeBatting = battingTeam === match.homeTeam;

  // Use live score for the batting team's display
  const homeRuns     = homeBatting && liveScore ? liveScore.runs    : match.homeScore;
  const homeWickets  = homeBatting && liveScore ? liveScore.wickets : match.homeWickets;
  const homeOvers    = homeBatting && liveScore ? liveScore.overs   : match.homeOvers;
  const awayRuns     = !homeBatting && liveScore ? liveScore.runs    : match.awayScore;
  const awayWickets  = !homeBatting && liveScore ? liveScore.wickets : match.awayWickets;
  const awayOvers    = !homeBatting && liveScore ? liveScore.overs   : match.awayOvers;
  const runRate      = liveScore?.runRate ?? null;

  return (
    <div className="sticky top-0 z-20 bg-[#0e1420]/95 backdrop-blur-md border-b border-white/[0.06]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00C853] rounded"
        >
          <ArrowLeft size={16} />
          Back
        </button>
        <div className="flex items-center gap-2">
          {isLive && (
            <Badge variant="live" className="gap-1.5">
              <span className="live-dot" />
              LIVE
            </Badge>
          )}
          {match.matchFormat && <Badge variant="format">{match.matchFormat}</Badge>}
          <div className="flex items-center gap-1 text-xs">
            {isConnected
              ? <Wifi size={12} className="text-[#00C853]" />
              : <WifiOff size={12} className="text-red-400 animate-pulse" />}
          </div>
        </div>
      </div>

      {/* Score display */}
      <div className="px-4 pb-3">
        {match.seriesName && (
          <p className="text-xs text-slate-500 mb-2 truncate">{match.seriesName}</p>
        )}

        <div className="flex items-center justify-between gap-4">
          {/* Home team */}
          <TeamScore
            team={match.homeTeam}
            runs={homeRuns}
            wickets={homeWickets}
            overs={homeOvers}
            isBatting={homeBatting && isLive}
            hasStarted={match.status !== 'scheduled'}
          />

          {/* Center: CRR / VS */}
          <div className="text-center shrink-0">
            {runRate !== null && isLive ? (
              <div className="flex flex-col items-center">
                <span className="text-xs text-slate-500">CRR</span>
                <span className="font-score text-lg font-bold text-[#00C853]">
                  {runRate.toFixed(2)}
                </span>
              </div>
            ) : (
              <span className="text-slate-600 text-sm font-medium">vs</span>
            )}
          </div>

          {/* Away team */}
          <TeamScore
            team={match.awayTeam}
            runs={awayRuns}
            wickets={awayWickets}
            overs={awayOvers}
            isBatting={!homeBatting && isLive && !!battingTeam}
            hasStarted={match.status !== 'scheduled'}
            align="right"
          />
        </div>
      </div>
    </div>
  );
}

function TeamScore({
  team, runs, wickets, overs, isBatting, hasStarted, align = 'left',
}: {
  team: string;
  runs: number;
  wickets: number;
  overs: string;
  isBatting: boolean;
  hasStarted: boolean;
  align?: 'left' | 'right';
}) {
  return (
    <div className={cn('flex flex-col gap-0.5 min-w-0', align === 'right' && 'items-end')}>
      <div className={cn('flex items-center gap-1.5', align === 'right' && 'flex-row-reverse')}>
        <span className="text-base">{getTeamFlag(team)}</span>
        <span className={cn('text-sm font-semibold', isBatting ? 'text-white' : 'text-slate-400')}>
          {team}
        </span>
        {isBatting && (
          <span className="w-1.5 h-1.5 rounded-full bg-[#00C853] animate-pulse" />
        )}
      </div>
      {hasStarted ? (
        <div className={cn('flex items-baseline gap-1', align === 'right' && 'flex-row-reverse')}>
          <span className="font-score text-2xl font-bold text-white leading-none">
            {runs}/{wickets}
          </span>
          <span className="text-xs text-slate-500">({overs})</span>
        </div>
      ) : (
        <span className="text-slate-600 text-sm">Yet to bat</span>
      )}
    </div>
  );
}
