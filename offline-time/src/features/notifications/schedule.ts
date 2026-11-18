// Pure notification timing rules. Kept free of expo-notifications so the arithmetic — when a
// focus timer ends, when tonight's bedtime reminder fires, when tomorrow's wake-up does — is
// unit tested without a device. The native wrapper (notifications.ts) only turns these into
// trigger objects.

export type Clock = { hour: number; minute: number };
export type SleepReminderKind = 'bedtime' | 'waketime';

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseClock(clock: string): Clock | null {
  const match = CLOCK.exec(clock);
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

export function clockLabel(clock: string): string {
  const parsed = parseClock(clock);
  if (!parsed) return clock;
  return `오${parsed.hour < 12 ? '전' : '후'} ${parsed.hour % 12 === 0 ? 12 : parsed.hour % 12}:${String(parsed.minute).padStart(2, '0')}`;
}

// The moment a focus session's goal is reached. A session that already started keeps its own
// clock, so the notification lands at the planned minute and not one restart later.
export function focusCompletionAt(startedAt: string | number | Date, plannedMinutes: number): Date {
  const start = startedAt instanceof Date ? startedAt : new Date(startedAt);
  const minutes = Number.isFinite(plannedMinutes) && plannedMinutes > 0 ? plannedMinutes : 0;
  return new Date(start.getTime() + minutes * 60_000);
}

// The next time the device's clock shows `clock`, strictly after `from`. A time that has
// already passed today belongs to tomorrow, and month ends roll over through Date itself.
export function nextClockOccurrence(clock: string, from: Date = new Date()): Date | null {
  const parsed = parseClock(clock);
  if (!parsed) return null;
  const next = new Date(from.getTime());
  next.setHours(parsed.hour, parsed.minute, 0, 0);
  if (next.getTime() <= from.getTime()) next.setDate(next.getDate() + 1);
  return next;
}

export function sleepReminderCopy(kind: SleepReminderKind, goal: { bedtime: string; waketime: string }) {
  if (kind === 'bedtime') {
    return {
      title: `${goal.bedtime} · 잘 시간이에요`,
      body: '충전기를 꽂고 수면 기록을 시작하면 아침까지 시간이 쌓여요.',
    };
  }
  return {
    title: `${goal.waketime} · 좋은 아침이에요`,
    body: '앱을 열고 한 번만 눌러 주세요. 밤새 쌓인 시간을 정산해 드릴게요.',
  };
}

export function focusCompleteCopy(plannedMinutes: number) {
  return {
    title: `${plannedMinutes}분 집중 목표를 채웠어요`,
    body: '앱에서 집중을 끝내면 기록이 정산돼요. 그전에 한 번 더 이어 가도 좋아요.',
  };
}
