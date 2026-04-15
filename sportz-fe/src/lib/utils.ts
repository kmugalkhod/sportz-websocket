import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, formatDistanceToNow } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMatchTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return format(date, 'MMM d, h:mm a');
  } catch {
    return dateStr;
  }
}

export function formatRelativeTime(dateStr: string): string {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return dateStr;
  }
}

export function formatScore(runs: number, wickets: number, overs: string): string {
  return `${runs}/${wickets} (${overs} ov)`;
}

export function formatRunRate(rr: number): string {
  return rr.toFixed(2);
}
