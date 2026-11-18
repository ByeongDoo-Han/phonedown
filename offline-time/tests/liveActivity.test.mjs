import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activityKey, elapsedSeconds, formatDurationKo, isGoalClock, kstClockLabel, kstDayStartMs,
  kstMinutesOfDay, MAX_ACTIVITY_MINUTES, sessionActivityProps, settledActivityProps, waketimeAt,
} from '../src/features/liveActivity/payload.ts';

const HOUR = 60 * 60 * 1000;

test('a focus goal counts down from the server start to the planned end', () => {
  const startedAt = '2026-11-19T01:00:00.000Z';
  const startMs = Date.parse(startedAt);
  const props = sessionActivityProps({
    mode: 'focus', serverStartedAt: startedAt, plannedMinutes: 30,
    nowMs: startMs + 5 * 60 * 1000,
  });
  assert.ok(props);
  assert.equal(props.kind, 'focus');
  assert.equal(props.phase, 'running');
  assert.equal(props.startedAtMs, startMs);
  assert.equal(props.endsAtMs, startMs + 30 * 60 * 1000);
  assert.equal(props.goalLabel, '목표 30분');
  assert.equal(props.summaryLabel, '');
  assert.equal(props.surface, '#FFFFFF');
});

test('a focus record without a goal still has a lower bound and no target', () => {
  const startedAt = '2026-11-19T01:00:00.000Z';
  const props = sessionActivityProps({
    mode: 'focus', serverStartedAt: startedAt, plannedMinutes: null,
  });
  assert.ok(props);
  assert.equal(props.endsAtMs, 0);
  assert.equal(props.goalLabel, '자유 집중');
});

test('the goal length is capped at the 12 hours the server keeps', () => {
  const startedAt = '2026-11-19T01:00:00.000Z';
  const props = sessionActivityProps({
    mode: 'focus', serverStartedAt: startedAt, plannedMinutes: 24 * 60,
  });
  assert.ok(props);
  assert.equal(props.endsAtMs, Date.parse(startedAt) + MAX_ACTIVITY_MINUTES * 60 * 1000);
});

test('a start time the device cannot parse never becomes a Live Activity', () => {
  assert.equal(sessionActivityProps({ mode: 'focus', serverStartedAt: 'not-a-date' }), null);
  assert.equal(sessionActivityProps({ mode: 'sleep', serverStartedAt: '' }), null);
});

test('a night that crosses midnight wakes on the next KST morning', () => {
  // 23:10 KST on 11-18 is 14:10Z; the 07:00 goal is 22:00Z the same UTC day.
  const startedAt = '2026-11-18T14:10:00.000Z';
  const startMs = Date.parse(startedAt);
  assert.equal(waketimeAt(startMs, '07:00'), Date.parse('2026-11-18T22:00:00.000Z'));
  assert.equal(kstClockLabel(waketimeAt(startMs, '07:00')), '07:00');

  const props = sessionActivityProps({
    mode: 'sleep', serverStartedAt: startedAt, goal: { bedtime: '23:00', waketime: '07:00' },
    nowMs: startMs + HOUR,
  });
  assert.ok(props);
  assert.equal(props.kind, 'sleep');
  assert.equal(props.endsAtMs, Date.parse('2026-11-18T22:00:00.000Z'));
  assert.equal(props.goalLabel, '기상 목표 07:00');
  assert.equal(props.surface, '#0F172A');
});

test('a record started after midnight wakes the same morning', () => {
  // 00:30 KST on 11-19 is 15:30Z on 11-18.
  const startMs = Date.parse('2026-11-18T15:30:00.000Z');
  assert.equal(waketimeAt(startMs, '07:00'), Date.parse('2026-11-18T22:00:00.000Z'));
  // A goal clock that already passed yesterday rolls to the next morning, not backwards.
  assert.equal(waketimeAt(startMs, '00:10'), startMs + (24 * 60 - 20) * 60 * 1000);
  assert.equal(waketimeAt(startMs, 'not-a-clock'), 0);
  assert.equal(isGoalClock('24:00'), false);
});

test('the KST clock helpers agree with the offset math', () => {
  const ms = Date.parse('2026-11-18T14:10:00.000Z');
  assert.equal(kstMinutesOfDay(ms), 23 * 60 + 10);
  assert.equal(kstClockLabel(ms), '23:10');
  assert.equal(kstDayStartMs(ms), Date.parse('2026-11-17T15:00:00.000Z'));
  assert.equal(kstClockLabel(kstDayStartMs(ms)), '00:00');
});

test('the night note changes once the wake target has passed', () => {
  const startedAt = '2026-11-18T14:10:00.000Z';
  const goal = { bedtime: '23:00', waketime: '07:00' };
  const running = sessionActivityProps({
    mode: 'sleep', serverStartedAt: startedAt, goal, nowMs: Date.parse('2026-11-18T18:00:00.000Z'),
  });
  const late = sessionActivityProps({
    mode: 'sleep', serverStartedAt: startedAt, goal, nowMs: Date.parse('2026-11-19T00:00:00.000Z'),
  });
  assert.ok(running && late);
  assert.match(running.noteLabel, /화면을 꺼도/);
  assert.match(late.noteLabel, /지났어요/);
});

test('a sleep record without a goal still shows the elapsed time', () => {
  const props = sessionActivityProps({
    mode: 'sleep', serverStartedAt: '2026-11-18T14:10:00.000Z', goal: null,
  });
  assert.ok(props);
  assert.equal(props.endsAtMs, 0);
  assert.equal(props.goalLabel, '수면 기록');
});

test('the settled state reports how long the record ran', () => {
  const props = settledActivityProps({
    mode: 'sleep',
    serverStartedAt: '2026-11-18T14:10:00.000Z',
    goal: { bedtime: '23:00', waketime: '07:00' },
    endedAtMs: Date.parse('2026-11-18T21:30:00.000Z'),
  });
  assert.ok(props);
  assert.equal(props.phase, 'settled');
  assert.equal(props.title, '수면 기록 정산 완료');
  assert.equal(props.summaryLabel, '총 7시간 20분');
  assert.equal(props.noteLabel, '기록 탭에서 확인할 수 있어요');

  const focus = settledActivityProps({
    mode: 'focus', serverStartedAt: '2026-11-19T01:00:00.000Z', plannedMinutes: 30,
    endedAtMs: Date.parse('2026-11-19T01:30:00.000Z'),
  });
  assert.ok(focus);
  assert.equal(focus.title, '집중 기록 완료');
  assert.equal(focus.summaryLabel, '총 30분');
});

test('durations read the way the rest of the app writes them', () => {
  assert.equal(formatDurationKo(0), '0초');
  assert.equal(formatDurationKo(45), '45초');
  assert.equal(formatDurationKo(60), '1분');
  assert.equal(formatDurationKo(3600), '1시간');
  assert.equal(formatDurationKo(3900), '1시간 5분');
  assert.equal(formatDurationKo(8 * 3600), '8시간');
  assert.equal(elapsedSeconds(Date.parse('2026-11-19T01:00:00.000Z'),
    Date.parse('2026-11-19T01:00:30.000Z')), 30);
  // A clock that runs backwards (a corrected device time) shows zero, never a negative timer.
  assert.equal(elapsedSeconds(Date.parse('2026-11-19T01:00:00.000Z'),
    Date.parse('2026-11-19T00:59:00.000Z')), 0);
});

test('the activity key changes only when the content does', () => {
  const base = { mode: 'focus', serverStartedAt: '2026-11-19T01:00:00.000Z', plannedMinutes: 30 };
  const first = sessionActivityProps(base);
  const same = sessionActivityProps(base);
  const longer = sessionActivityProps({ ...base, plannedMinutes: 60 });
  assert.equal(activityKey(first), activityKey(same));
  assert.notEqual(activityKey(first), activityKey(longer));
  assert.equal(activityKey(null), 'none');
});
