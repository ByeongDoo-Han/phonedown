// Sleep goal times and the night window. Pure functions (no React, no native modules) so the
// rules can be unit tested: a goal that crosses midnight, a session around it, and which mode
// the home screen opens with at a given hour.

export type SleepGoal = { bedtime: string; waketime: string };

export const BEDTIME_CHOICES = ['21:00', '22:00', '23:00', '00:00', '01:00'] as const;
export const WAKETIME_CHOICES = ['05:00', '06:00', '07:00', '08:00', '09:00'] as const;

export const DEFAULT_SLEEP_GOAL: SleepGoal = { bedtime: '23:00', waketime: '07:00' };

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isClock(value: unknown): value is string {
  return typeof value === 'string' && CLOCK.test(value);
}

// Postgres hands back `time` as HH:MM:SS and the app stores HH:MM.
export function normalizeClock(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.slice(0, 5);
  return isClock(trimmed) ? trimmed : null;
}

export function minutesOfClock(clock: string): number {
  const [hours, minutes] = clock.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

// Hours between bedtime and waketime, counted across midnight (23:00 → 07:00 = 8h).
export function goalMinutes(bedtime: string, waketime: string): number {
  const span = minutesOfClock(waketime) - minutesOfClock(bedtime);
  return span > 0 ? span : span + 24 * 60;
}

export function formatGoalMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours <= 0) return `${rest}분`;
  return rest === 0 ? `${hours}시간` : `${hours}시간 ${rest}분`;
}

// True while "now" is inside the bedtime → waketime window, which spans midnight.
export function inNightWindow(minutesNow: number, goal: SleepGoal): boolean {
  const start = minutesOfClock(goal.bedtime);
  const end = minutesOfClock(goal.waketime);
  if (start === end) return false;
  if (start < end) return minutesNow >= start && minutesNow < end;
  return minutesNow >= start || minutesNow < end;
}

// KST wall clock of a moment, as minutes since midnight.
export function kstMinutes(now = new Date()): number {
  const clock = now.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Seoul',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });
  return minutesOfClock(clock);
}

export type PrimaryMode = 'sleep' | 'focus' | 'both';

// Which record the home screen puts first: the primary mode, except that a night-time sleep
// user starts on the sleep card and a focus user stays on focus.
export function preferredMode(primary: PrimaryMode, minutesNow: number,
  goal: SleepGoal): 'sleep' | 'focus' {
  if (primary === 'focus') return 'focus';
  const night = inNightWindow(minutesNow, goal);
  if (primary === 'sleep') return night ? 'sleep' : 'focus';
  return night ? 'sleep' : 'focus';
}

export function goalFromProfile(bedtime: string | null | undefined,
  waketime: string | null | undefined): SleepGoal {
  return {
    bedtime: normalizeClock(bedtime) ?? DEFAULT_SLEEP_GOAL.bedtime,
    waketime: normalizeClock(waketime) ?? DEFAULT_SLEEP_GOAL.waketime,
  };
}
