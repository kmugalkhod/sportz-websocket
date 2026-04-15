import { CommentaryEvent, EventType } from '../types';
import { cn } from '../lib/utils';

interface Props { events: CommentaryEvent[] }

type BallKind = 'six' | 'four' | 'wicket' | 'wide' | 'dot' | 'run';

function classify(type: EventType): BallKind | null {
  switch (type) {
    case 'boundary_six':  return 'six';
    case 'boundary_four': return 'four';
    case 'wicket':        return 'wicket';
    case 'wide':
    case 'no_ball':       return 'wide';
    case 'dot_ball':      return 'dot';
    case 'ball':          return 'run';
    default:              return null;
  }
}

const KIND_STYLE: Record<BallKind, string> = {
  six:    'bg-purple-600 border-purple-500 text-white shadow-[0_0_10px_rgba(168,85,247,0.5)]',
  four:   'bg-blue-600 border-blue-500 text-white shadow-[0_0_10px_rgba(59,130,246,0.5)]',
  wicket: 'bg-red-600 border-red-500 text-white shadow-[0_0_10px_rgba(239,68,68,0.5)]',
  wide:   'bg-yellow-500 border-yellow-400 text-black',
  dot:    'bg-slate-700 border-slate-600 text-slate-400',
  run:    'bg-emerald-800 border-emerald-700 text-emerald-300',
};

const KIND_LABEL: Record<BallKind, string> = {
  six:    '6',
  four:   '4',
  wicket: 'W',
  wide:   'Wd',
  dot:    '•',
  run:    '',
};

export default function BallStrip({ events }: Props) {
  // Take last 8 ball events (skip over markers)
  const balls = events
    .filter(e => classify(e.eventType) !== null)
    .slice(-8)
    .reverse();

  return (
    <div className="flex items-center gap-1.5 flex-wrap" aria-label="Recent balls">
      {balls.map((e, i) => {
        const kind = classify(e.eventType)!;
        const label = kind === 'run' ? (e.metadata.runs?.toString() ?? '·') : KIND_LABEL[kind];
        return (
          <div
            key={`${e.id}-${i}`}
            className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border transition-all',
              KIND_STYLE[kind],
              i === 0 && 'ball-pop'
            )}
            title={e.message}
          >
            {label}
          </div>
        );
      })}
      {balls.length === 0 && (
        <span className="text-xs text-slate-600">No balls yet</span>
      )}
    </div>
  );
}
