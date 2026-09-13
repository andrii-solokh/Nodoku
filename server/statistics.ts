export type StatisticsPeriod = 'today' | '7d' | '30d' | 'all';
export type SponsorEventKind = 'view' | 'click';

export interface Completion {
  visitorId: string;
  attemptId: string;
  size: number;
  depth: number;
  difficulty: 'easy' | 'medium' | 'hard';
  seed: number;
  connections: number;
  dots: number;
}

export interface Statistics {
  scope: 'local' | 'global';
  period: StatisticsPeriod;
  trackingSince: string;
  totals: { visitors: number; puzzlesSolved: number; dotsCleared: number; nodesFilled: number; connectionsCompleted: number };
  daily: { date: string; visitors: number; puzzlesSolved: number; dotsCleared: number; nodesFilled: number }[];
  sizes: { size: number; depth: number; count: number }[];
  difficulties: { difficulty: string; count: number }[];
}

export interface SponsorReport {
  brand: string;
  period: StatisticsPeriod;
  totals: { views: number; clicks: number; ctr: number };
  daily: { date: string; views: number; clicks: number }[];
}

const DAY = 86_400_000;
export const utcDay = (now: number): string => new Date(now).toISOString().slice(0, 10);
export function periodStart(period: StatisticsPeriod, now: number): string {
  return period === 'all' ? '0000-01-01'
    : utcDay(Date.parse(`${utcDay(now)}T00:00:00.000Z`) - (period === 'today' ? 0 : period === '7d' ? 6 : 29) * DAY);
}

/** Even all-time reports show at most 30 known tracking days in their chart. */
export function chartDays(period: StatisticsPeriod, now: number, trackingSince: string, since?: string): string[] {
  const first = [periodStart(period === 'all' ? '30d' : period, now), trackingSince.slice(0, 10), since?.slice(0, 10) ?? ''].sort().at(-1)!;
  const days: string[] = [];
  for (let time = Date.parse(`${first}T00:00:00.000Z`); time <= now; time += DAY) days.push(utcDay(time));
  return days;
}
