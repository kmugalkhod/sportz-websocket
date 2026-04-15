import { CommentaryEvent } from '../types';
import { cn } from '../lib/utils';

interface Props {
  events: CommentaryEvent[];
  currentOver: string; // e.g. "18.2"
}

type BallResult = 'six' | 'four' | 'wicket' | 'wide' | 'dot' | 'run';

function getBallResult(e: CommentaryEvent): BallResult {
  switch (e.eventType) {
    case 'boundary_six':  return 'six';
    case 'boundary_four': return 'four';
    case 'wicket':        return 'wicket';
    case 'wide':
    case 'no_ball':       return 'wide';
    case 'dot_ball':      return 'dot';
    default:              return 'run';
  }
}

const DOT_STYLE: Record<BallResult, string> = {
  six:    'bg-purple-500 text-white border-purple-400',
  four:   'bg-blue-500 text-white border-blue-400',
  wicket: 'bg-red-500 text-white border-red-400',
  wide:   'bg-yellow-500 text-black border-yellow-400',
  dot:    'bg-slate-700 text-slate-400 border-slate-600',
  run:    'bg-emerald-700 text-white border-emerald-600',
};

const DOT_LABEL: Record<BallResult, string> = {
  six:    '6',
  four:   '4',
  wicket: 'W',
  wide:   'Wd',
  dot:    '•',
  run:    '',
};

export default function OverProgress({ events, currentOver }: Props) {
  // Get the integer part of currentOver (the over number being bowled)
  const overNum = Math.floor(parseFloat(currentOver));

  // Balls in this over = events whose over starts with "<overNum>."
  const overBalls = events
    .filter(e =>
      !['over_complete', 'innings_start', 'innings_end', 'match_start', 'match_end', 'rain_delay'].includes(e.eventType) &&
      e.metadata.over.startsWith(`${overNum}.`)
    )
    .slice(-6); // max 6 legal deliveries

  const filled: (BallResult | null)[] = Array.from({ length: 6 }, (_, i) =>
    overBalls[i] ? getBallResult(overBalls[i]) : null
  );

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-slate-500 mr-1 shrink-0">Over {overNum + 1}</span>
      {filled.map((result, i) => (
        <div
          key={i}
          className={cn(
            'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border transition-all',
            result
              ? DOT_STYLE[result]
              : 'bg-slate-800 border-slate-700 text-slate-600'
          )}
        >
          {result ? (DOT_LABEL[result] || (overBalls[i]?.metadata.runs?.toString() ?? '')) : ''}
        </div>
      ))}
    </div>
  );
}
