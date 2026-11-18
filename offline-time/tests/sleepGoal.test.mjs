import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_SLEEP_GOAL, formatGoalMinutes, goalFromProfile, goalMinutes, inNightWindow, isClock,
  minutesOfClock, normalizeClock, preferredMode,
} from '../src/features/sleep/sleepGoal.ts';

test('postgres time values are normalized to HH:MM', () => {
  assert.equal(normalizeClock('23:00:00'), '23:00');
  assert.equal(normalizeClock('07:05'), '07:05');
  assert.equal(normalizeClock(null), null);
  assert.equal(normalizeClock('25:00'), null);
  assert.equal(isClock('7:00'), false);
  assert.equal(isClock('07:00'), true);
});

test('a sleep goal that crosses midnight counts the hours across it', () => {
  assert.equal(goalMinutes('23:00', '07:00'), 480);
  assert.equal(goalMinutes('22:30', '06:00'), 450);
  // A wake time before the bedtime is read as the next morning, never as a negative night.
  assert.equal(goalMinutes('01:00', '00:30'), 1410);
  assert.equal(formatGoalMinutes(480), '8시간');
  assert.equal(formatGoalMinutes(450), '7시간 30분');
  assert.equal(formatGoalMinutes(30), '30분');
});

test('the night window runs from bedtime to wake time and never includes midday', () => {
  const goal = { bedtime: '23:00', waketime: '07:00' };
  assert.equal(inNightWindow(minutesOfClock('23:30'), goal), true);
  assert.equal(inNightWindow(minutesOfClock('00:10'), goal), true);
  assert.equal(inNightWindow(minutesOfClock('06:59'), goal), true);
  assert.equal(inNightWindow(minutesOfClock('07:00'), goal), false);
  assert.equal(inNightWindow(minutesOfClock('14:00'), goal), false);
  assert.equal(inNightWindow(minutesOfClock('22:59'), goal), false);

  const daytime = { bedtime: '01:00', waketime: '09:00' };
  assert.equal(inNightWindow(minutesOfClock('02:00'), daytime), true);
  assert.equal(inNightWindow(minutesOfClock('23:00'), daytime), false);
});

test('the home screen opens on sleep at night and on focus by day', () => {
  const goal = { bedtime: '23:00', waketime: '07:00' };
  assert.equal(preferredMode('sleep', minutesOfClock('23:30'), goal), 'sleep');
  assert.equal(preferredMode('sleep', minutesOfClock('14:00'), goal), 'focus');
  assert.equal(preferredMode('both', minutesOfClock('01:00'), goal), 'sleep');
  assert.equal(preferredMode('both', minutesOfClock('12:00'), goal), 'focus');
  // A focus user never gets the sleep card first, even at night.
  assert.equal(preferredMode('focus', minutesOfClock('01:00'), goal), 'focus');
});

test('a profile without goal times falls back to the 23:00–07:00 default', () => {
  assert.deepEqual(goalFromProfile(null, null), DEFAULT_SLEEP_GOAL);
  assert.deepEqual(goalFromProfile('22:00:00', '06:30:00'), { bedtime: '22:00', waketime: '06:30' });
  // A half-set profile keeps the stored half and fills the other.
  assert.deepEqual(goalFromProfile('22:00:00', null), { bedtime: '22:00', waketime: '07:00' });
});
