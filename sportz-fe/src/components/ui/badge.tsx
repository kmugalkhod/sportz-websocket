import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badge = cva(
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default:    'bg-white/10 text-slate-300',
        live:       'bg-red-500/20 text-red-400 border border-red-500/30',
        scheduled:  'bg-slate-700/60 text-slate-400',
        finished:   'bg-zinc-800/60 text-zinc-500',
        format:     'bg-emerald-900/40 text-emerald-400 border border-emerald-700/30',
        green:      'bg-green-500/20 text-green-400',
        destructive:'bg-red-900/40 text-red-400',
        outline:    'border border-white/20 text-slate-300',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badge> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badge({ variant }), className)} {...props} />;
}
