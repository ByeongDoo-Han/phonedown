import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clockLabel, focusCompleteCopy, focusCompletionAt, nextClockOccurrence, parseClock,
  sleepReminderCopy,
} from '../src/features/notifications/schedule.ts';

test('a clock value is read only when it is a real 24-hour time', () => {
  assert.deepEqual(parseClock('23:00'), { hour: 23, minute: 0 });
  assert.deepEqual(parseClock('07:05'), { hour: 7, minute: 5 });
  assert.equal(parseClock('24:00'), null);
  assert.equal(parseClock('7:00'), null);
  assert.equal(parseClock('23:60'), null);
  assert.equal(parseClock(''), null);
  assert.equal(clockLabel('23:00'), '오후 11:00');
  assert.equal(clockLabel('07:30'), '오전 7:30');
  assert.equal(clockLabel('00:15'), '오전 12:15');
  assert.equal(clockLabel('12:00'), '오후 12:00');
});

test('a focus goal ends exactly the planned minutes after the session started', () => {
  const start = '2026-11-18T23:10:00.000Z';
  assert.equal(focusCompletionAt(start, 30).toISOString(), '2026-11-18T23:40:00.000Z');
  assert.equal(focusCompletionAt(start, 90).toISOString(), '2026-11-19T00:40:00.000Z');
  // The base can also be a Date or an epoch, and an unusable goal never jumps into the past.
  const date = new Date(start);
  assert.equal(focusCompletionAt(date, 60).toISOString(), '2026-11-19T00:10:00.000Z');
  assert.equal(focusCompletionAt(start, 0).toISOString(), start);
  assert.equal(focusCompletionAt(start, Number.NaN).toISOString(), start);
});

test('the next daily reminder is today when the clock is still ahead, otherwise tomorrow', () => {
  const morning = new Date(2026, 10, 19, 8, 30, 0, 0);
  const bedtime = nextClockOccurrence('23:00', morning);
  assert.equal(bedtime?.getDate(), 19);
  assert.equal(bedtime?.getHours(), 23);
  assert.equal(bedtime?.getMinutes(), 0);

  const evening = new Date(2026, 10, 19, 23, 30, 0, 0);
  const tomorrowBedtime = nextClockOccurrence('23:00', evening);
  assert.equal(tomorrowBedtime?.getDate(), 20);
  assert.equal(tomorrowBedtime?.getHours(), 23);

  // Exactly on the minute counts as passed: the reminder is the next day's, not a same-second one.
  const exactly = new Date(2026, 10, 19, 7, 0, 0, 0);
  assert.equal(nextClockOccurrence('07:00', exactly)?.getDate(), 20);

  assert.equal(nextClockOccurrence('25:00', morning), null);
});

test('a daily reminder rolls over month and year boundaries', () => {
  const lastMinute = new Date(2026, 11, 31, 23, 59, 0, 0);
  const next = nextClockOccurrence('00:30', lastMinute);
  assert.equal(next?.getFullYear(), 2027);
  assert.equal(next?.getMonth(), 0);
  assert.equal(next?.getDate(), 1);
  assert.equal(next?.getHours(), 0);
  assert.equal(next?.getMinutes(), 30);
});

test('the reminder copy carries the goal times and the focus goal length', () => {
  const goal = { bedtime: '23:00', waketime: '07:00' };
  assert.match(sleepReminderCopy('bedtime', goal).title, /23:00/);
  assert.match(sleepReminderCopy('waketime', goal).title, /07:00/);
  assert.notEqual(sleepReminderCopy('bedtime', goal).body, sleepReminderCopy('waketime', goal).body);
  assert.match(focusCompleteCopy(60).title, /60분/);
  assert.equal(focusCompleteCopy(30).title, '30분 집중 목표를 채웠어요');
});
