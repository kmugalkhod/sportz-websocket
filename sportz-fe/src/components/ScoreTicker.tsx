import { Match } from '../types';
import { getTeamFlag } from '../lib/teamFlags';

interface Props { matches: Match[] }

export default function ScoreTicker({ matches }: Props) {
  const liveMatches = matches.filter(m => m.status === 'live');
  if (liveMatches.length === 0) return null;

  // Duplicate for seamless infinite scroll
  const items = [...liveMatches, ...liveMatches];

  return (
    <div
      className="bg-[#00C853]/10 border-b border-[#00C853]/20 overflow-hidden py-2"
      aria-label="Live score ticker"
      aria-live="polite"
    >
      <div
        className="flex gap-8 whitespace-nowrap"
        style={{
          animation: `ticker-scroll ${liveMatches.length * 8}s linear infinite`,
          width: 'max-content',
        }}
      >
        {items.map((m, i) => (
          <TickerItem key={`${m.id}-${i}`} match={m} />
        ))}
      </div>
    </div>
  );
}

function TickerItem({ match }: { match: Match }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      <span className="live-dot" />
      <span className="text-slate-300">
        {getTeamFlag(match.homeTeam)} {match.homeTeam}
        <span className="font-score font-bold text-white mx-1">
          {match.homeScore}/{match.homeWickets}
        </span>
        <span className="text-slate-500">({match.homeOvers})</span>
      </span>
      <span className="text-slate-600">vs</span>
      <span className="text-slate-300">
        {getTeamFlag(match.awayTeam)} {match.awayTeam}
        <span className="font-score font-bold text-white mx-1">
          {match.awayScore}/{match.awayWickets}
        </span>
        <span className="text-slate-500">({match.awayOvers})</span>
      </span>
      <span className="text-slate-700 ml-2">•</span>
    </span>
  );
}
