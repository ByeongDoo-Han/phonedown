// The content a Live Activity shows, computed away from React and native modules so the rules
// can be unit tested: where a focus countdown ends, which wake time a night belongs to, and
// what the lock screen says while a record is still running.
//
// The layout in `sessionActivityLayout.tsx` is compiled to a string and evaluated inside the
// widget runtime, where it can only use its props and the SwiftUI components. So every label
// this file produces is display-ready here, and the layout only arranges it.

import type { SessionMode } from '@/features/session/sessionApi';

export type SessionActivityKind = SessionMode;
export type SessionActivityPhase = 'running' | 'settled';

export type SessionActivityProps = {
  kind: SessionActivityKind;
  phase: SessionActivityPhase;
  /** Server start of the record, epoch ms — the lower bound of the live timer. */
  startedAtMs: number;
  /** Focus goal end or sleep wake target, epoch ms. 0 when the record has no target. */
  endsAtMs: number;
  title: string;
  goalLabel: string;
  noteLabel: string;
  /** Filled on the settled state; the layout shows it in place of the timer. */
  summaryLabel: string;
  accent: string;
  surface: string;
};

export type SessionActivityInput = {
  mode: SessionMode;
  /** `server_started_at` of the session: the server clock is the one the app trusts. */
  serverStartedAt: string;
  plannedMinutes?: number | null;
  goal?: { bedtime: string; waketime: string } | null;
  nowMs?: number;
};

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
// KST has no daylight saving time, so a fixed offset is exact and needs no Intl data.
const KST_OFFSET_MS = 9 * 60 * MINUTE_MS;
// A sleep record is capped by the server at 12 hours; the lock-screen count-up stops there
// instead of running past a night that has clearly ended.
export const MAX_ACTIVITY_MINUTES = 12 * 60;

const ACCENT_DAY = '#0F766E';
const ACCENT_NIGHT = '#C7D2FE';
const SURFACE_DAY = '#FFFFFF';
const SURFACE_NIGHT = '#0F172A';

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isGoalClock(value: unknown): value is string {
  return typeof value === 'string' && CLOCK.test(value);
}

// Minutes since KST midnight for a moment.
export function kstMinutesOfDay(ms: number): number {
  const minutes = Math.floor((ms + KST_OFFSET_MS) / MINUTE_MS);
  return ((minutes % 1440) + 1440) % 1440;
}

// Epoch ms of KST midnight on the day that contains `ms`.
export function kstDayStartMs(ms: number): number {
  return Math.floor((ms + KST_OFFSET_MS) / DAY_MS) * DAY_MS - KST_OFFSET_MS;
}

export function kstClockLabel(ms: number): string {
  const minutes = kstMinutesOfDay(ms);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

// The wake target a bedtime belongs to: today's clock if it is still ahead, otherwise the next
// morning. A record started at 00:30 for a 07:00 goal wakes the same day; one started at 23:10
// wakes the day after.
export function waketimeAt(startedAtMs: number, waketime: string): number {
  if (!isGoalClock(waketime)) return 0;
  const [hours, minutes] = waketime.split(':').map(Number);
  const offset = (hours ?? 0) * 60 + (minutes ?? 0);
  const target = kstDayStartMs(startedAtMs) + offset * MINUTE_MS;
  return target > startedAtMs ? target : target + DAY_MS;
}

export function elapsedSeconds(startedAtMs: number, nowMs: number): number {
  if (!Number.isFinite(startedAtMs)) return 0;
  return Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));
}

export function formatDurationKo(seconds: number): string {
  if (seconds < 60) return `${Math.max(0, Math.floor(seconds))}초`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours <= 0) return `${minutes}분`;
  return minutes === 0 ? `${hours}시간` : `${hours}시간 ${minutes}분`;
}

function parseStart(serverStartedAt: string): number {
  const startedAtMs = Date.parse(serverStartedAt);
  return Number.isFinite(startedAtMs) ? startedAtMs : NaN;
}

function focusEndMs(startedAtMs: number, plannedMinutes: number | null | undefined): number {
  if (!plannedMinutes || !Number.isFinite(plannedMinutes) || plannedMinutes <= 0) return 0;
  const bounded = Math.min(plannedMinutes, MAX_ACTIVITY_MINUTES);
  return startedAtMs + bounded * MINUTE_MS;
}

// The running state for a record. Null when the start time cannot be trusted — a Live Activity
// with a broken clock is worse than none.
export function sessionActivityProps(input: SessionActivityInput): SessionActivityProps | null {
  const startedAtMs = parseStart(input.serverStartedAt);
  const nowMs = input.nowMs ?? Date.now();
  if (!Number.isFinite(startedAtMs)) return null;

  if (input.mode === 'focus') {
    const planned = input.plannedMinutes && input.plannedMinutes > 0 ? input.plannedMinutes : null;
    return {
      kind: 'focus',
      phase: 'running',
      startedAtMs,
      endsAtMs: focusEndMs(startedAtMs, planned),
      title: '집중 기록 중',
      goalLabel: planned ? `목표 ${planned}분` : '자유 집중',
      noteLabel: '폰을 내려놓은 시간이 잠금화면에서도 이어져요',
      summaryLabel: '',
      accent: ACCENT_DAY,
      surface: SURFACE_DAY,
    };
  }

  if (input.mode !== 'sleep') return null;

  const target = input.goal?.waketime ? waketimeAt(startedAtMs, input.goal.waketime) : 0;
  const wakeLabel = target > 0 ? kstClockLabel(target) : null;
  const missed = target > 0 && nowMs >= target;
  return {
    kind: 'sleep',
    phase: 'running',
    startedAtMs,
    endsAtMs: target,
    title: '수면 기록 중',
    goalLabel: wakeLabel ? `기상 목표 ${wakeLabel}` : '수면 기록',
    noteLabel: missed
      ? '기상 목표 시간이 지났어요 · 일어나면 한 번만 눌러 주세요'
      : '화면을 꺼도 기록은 이어져요 · 아침에 한 번만 누르면 정산돼요',
    summaryLabel: '',
    accent: ACCENT_NIGHT,
    surface: SURFACE_NIGHT,
  };
}

// The final state shown for a moment after settlement, so the lock screen agrees with the app:
// the same record, now closed, with how long it ran.
export function settledActivityProps(
  input: SessionActivityInput & { endedAtMs?: number }
): SessionActivityProps | null {
  const endedAtMs = input.endedAtMs ?? input.nowMs ?? Date.now();
  const base = sessionActivityProps({ ...input, nowMs: endedAtMs });
  if (!base) return null;
  return {
    ...base,
    phase: 'settled',
    title: base.kind === 'sleep' ? '수면 기록 정산 완료' : '집중 기록 완료',
    goalLabel: base.goalLabel,
    noteLabel: '기록 탭에서 확인할 수 있어요',
    summaryLabel: `총 ${formatDurationKo(elapsedSeconds(base.startedAtMs, endedAtMs))}`,
  };
}

// A stable key for "is this the same content" — the bridge skips redundant native updates.
export function activityKey(props: SessionActivityProps | null): string {
  if (!props) return 'none';
  return [
    props.kind, props.phase, props.startedAtMs, props.endsAtMs,
    props.title, props.goalLabel, props.noteLabel, props.summaryLabel,
  ].join('|');
}
