import { useMemo } from 'react';
import { CommentaryEvent, EventType } from '../types';
import { cn } from '../lib/utils';
import { Zap, Droplets, AlertTriangle, Flag } from 'lucide-react';

interface Props { events: CommentaryEvent[] }

// Events that act as section dividers / announcements
const ANNOUNCEMENT_TYPES: EventType[] = [
  'innings_start', 'innings_end', 'match_start', 'match_end', 'rain_delay',
];

// Events that are ball-level (group under over)
const BALL_TYPES: EventType[] = [
  'boundary_four', 'boundary_six', 'wicket', 'wide', 'no_ball', 'dot_ball', 'ball',
];

interface OverGroup {
  overNum: string;
  overComplete: CommentaryEvent | null;
  balls: CommentaryEvent[];
}

function groupByOver(events: CommentaryEvent[]): Array<OverGroup | CommentaryEvent> {
  const result: Array<OverGroup | CommentaryEvent> = [];
  const overMap = new Map<string, OverGroup>();

  // Process in chronological order (reversed since API returns newest first)
  const ordered = [...events].reverse();

  for (const e of ordered) {
    if (ANNOUNCEMENT_TYPES.includes(e.eventType)) {
      result.push(e);
      continue;
    }
    if (e.eventType === 'over_complete') {
      const overNum = e.metadata.over;
      const group = overMap.get(overNum) ?? { overNum, overComplete: null, balls: [] };
      group.overComplete = e;
      overMap.set(overNum, group);
      if (!result.find(r => 'overNum' in r && (r as OverGroup).overNum === overNum)) {
        result.push(group);
      }
      continue;
    }
    if (BALL_TYPES.includes(e.eventType)) {
      const overNum = e.metadata.over?.split('.')[0] ?? '0';
      const group = overMap.get(overNum) ?? { overNum, overComplete: null, balls: [] };
      group.balls.push(e);
      overMap.set(overNum, group);
      if (!result.find(r => 'overNum' in r && (r as OverGroup).overNum === overNum)) {
        result.push(group);
      }
    }
  }

  return result.reverse(); // newest at top
}

export default function CommentaryFeed({ events }: Props) {
  const groups = useMemo(() => groupByOver(events.slice(0, 200)), [events]);

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center py-12 text-center">
        <span className="text-3xl mb-2">🏏</span>
        <p className="text-slate-500 text-sm">No commentary yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3" aria-live="polite" aria-label="Live commentary">
      {groups.map((item, idx) => {
        if ('eventType' in item) {
          // Announcement event
          return <AnnouncementRow key={`ann-${item.id}`} event={item} isNew={idx === 0} />;
        }
        // Over group
        return <OverGroupCard key={`over-${item.overNum}`} group={item} isNew={idx === 0} />;
      })}
    </div>
  );
}

// ─── Over group card ───────────────────────────────────────────
function OverGroupCard({ group, isNew }: { group: OverGroup; isNew: boolean }) {
  const balls = [...group.balls].reverse(); // newest first within over

  return (
    <div className={cn('glass-card overflow-hidden', isNew && 'event-slide-in')}>
      {/* Over header */}
      {group.overComplete && (
        <div className="px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.02]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
              Over {parseInt(group.overNum) + 1} complete
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{group.overComplete.message}</p>
        </div>
      )}

      {/* Ball rows */}
      <div className="divide-y divide-white/[0.04]">
        {balls.map((e, i) => (
          <BallRow key={e.id} event={e} isNewest={isNew && i === 0} />
        ))}
      </div>
    </div>
  );
}

// ─── Ball row ─────────────────────────────────────────────────
function BallRow({ event: e, isNewest }: { event: CommentaryEvent; isNewest: boolean }) {
  const isWicket = e.eventType === 'wicket';
  const isSix    = e.eventType === 'boundary_six';
  const isFour   = e.eventType === 'boundary_four';

  return (
    <div
      className={cn(
        'flex gap-3 px-4 py-3 transition-colors',
        isWicket && 'bg-red-950/30',
        isSix    && 'bg-purple-950/30',
        isFour   && 'bg-blue-950/20',
        isNewest && !isWicket && !isSix && !isFour && 'bg-white/[0.02]',
      )}
    >
      {/* Ball indicator */}
      <div className="shrink-0 pt-0.5">
        <BallDot type={e.eventType} runs={e.metadata.runs} />
      </div>

      <div className="min-w-0 flex-1">
        {/* Over + bowler */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-mono text-slate-500">{e.metadata.over}</span>
          {e.metadata.bowler && (
            <span className="text-xs text-slate-600 truncate">
              {e.metadata.bowler}
              {e.metadata.bowlerWickets > 0 && (
                <span className="text-slate-500"> · {e.metadata.bowlerWickets}/{e.metadata.bowlerRuns}</span>
              )}
            </span>
          )}
          {e.actor && (
            <>
              <span className="text-slate-700">→</span>
              <span className="text-xs text-slate-500 truncate">{e.actor}</span>
            </>
          )}
        </div>

        {/* Commentary message */}
        <p className={cn(
          'text-sm leading-snug',
          isWicket ? 'text-red-300 font-medium' : isSix ? 'text-purple-300' : isFour ? 'text-blue-300' : 'text-slate-300',
        )}>
          {e.message}
        </p>
      </div>
    </div>
  );
}

// ─── Ball dot indicator ────────────────────────────────────────
function BallDot({ type, runs }: { type: EventType; runs: number }) {
  const base = 'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border shrink-0';

  switch (type) {
    case 'boundary_six':
      return <div className={cn(base, 'bg-purple-600 border-purple-500 text-white')}>6</div>;
    case 'boundary_four':
      return <div className={cn(base, 'bg-blue-600 border-blue-500 text-white')}>4</div>;
    case 'wicket':
      return <div className={cn(base, 'bg-red-600 border-red-500 text-white')}>W</div>;
    case 'wide':
      return <div className={cn(base, 'bg-yellow-500 border-yellow-400 text-black text-[10px]')}>Wd</div>;
    case 'no_ball':
      return <div className={cn(base, 'bg-orange-500 border-orange-400 text-white text-[10px]')}>Nb</div>;
    case 'dot_ball':
      return <div className={cn(base, 'bg-slate-800 border-slate-700 text-slate-500')}>•</div>;
    default:
      return (
        <div className={cn(base, 'bg-emerald-900 border-emerald-800 text-emerald-400')}>
          {runs > 0 ? runs : '·'}
        </div>
      );
  }
}

// ─── Announcement row ─────────────────────────────────────────
function AnnouncementRow({ event: e, isNew }: { event: CommentaryEvent; isNew: boolean }) {
  const isRain    = e.eventType === 'rain_delay';
  const isWicket  = false;
  const isInnings = e.eventType === 'innings_start' || e.eventType === 'innings_end';
  const isMatch   = e.eventType === 'match_start' || e.eventType === 'match_end';

  return (
    <div
      className={cn(
        'rounded-xl px-4 py-3 flex items-start gap-3',
        isRain   && 'bg-blue-950/40 border border-blue-700/30',
        isInnings && 'bg-[#00C853]/10 border border-[#00C853]/20',
        isMatch   && 'bg-amber-950/40 border border-amber-700/30',
        isNew    && 'event-slide-in',
      )}
    >
      <AnnouncementIcon type={e.eventType} />
      <p className={cn(
        'text-sm font-medium',
        isRain   && 'text-blue-300',
        isInnings && 'text-[#00C853]',
        isMatch   && 'text-amber-300',
      )}>
        {e.message}
      </p>
    </div>
  );
}

function AnnouncementIcon({ type }: { type: EventType }) {
  const cls = 'shrink-0 mt-0.5';
  switch (type) {
    case 'rain_delay':    return <Droplets  size={16} className={cn(cls, 'text-blue-400')} />;
    case 'innings_start':
    case 'innings_end':   return <Flag      size={16} className={cn(cls, 'text-[#00C853]')} />;
    case 'match_start':
    case 'match_end':     return <Zap       size={16} className={cn(cls, 'text-amber-400')} />;
    default:              return <AlertTriangle size={16} className={cn(cls, 'text-slate-400')} />;
  }
}
