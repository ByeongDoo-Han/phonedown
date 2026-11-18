import assert from 'node:assert/strict';
import test from 'node:test';

import { describeStartError, isOptimisticSession, optimisticSession } from '../src/features/session/optimistic.ts';

const base = {
  id: 'pending-2026-11-19T00:00:00.000Z',
  userId: 'user-1',
  startedAt: '2026-11-19T00:00:00.000Z',
  charging: true,
};

test('the optimistic record is an open record that starts at the pressed moment', () => {
  const focus = optimisticSession({ ...base, mode: 'focus', plannedMinutes: 30 });
  assert.equal(focus.mode, 'focus');
  assert.equal(focus.status, 'open');
  assert.equal(focus.server_started_at, base.startedAt);
  assert.equal(focus.client_started_at, base.startedAt);
  assert.equal(focus.planned_minutes, 30);
  assert.equal(focus.source, 'timer');
  assert.equal(focus.started_charging, true);
  assert.equal(focus.ended_charging, null);
  assert.ok(isOptimisticSession(focus));
});

test('a sleep record is marked as charge-based and keeps its goal length', () => {
  const sleep = optimisticSession({ ...base, mode: 'sleep', plannedMinutes: 480, charging: null });
  assert.equal(sleep.source, 'charge');
  assert.equal(sleep.planned_minutes, 480);
  assert.equal(sleep.started_charging, null);
});

test('a real row is never mistaken for the optimistic one', () => {
  const real = optimisticSession({ ...base, mode: 'focus', plannedMinutes: 60 });
  assert.ok(isOptimisticSession(real));
  assert.equal(isOptimisticSession({ ...real, id: '5f1b2c3d' }), false);
});

test('start failures get the sentence the user can act on', () => {
  assert.match(describeStartError(new Error('Edge Function returned a non-2xx status code (409)')),
    /이미 진행 중인 기록/);
  assert.match(describeStartError(new Error('Already an open session')), /이미 진행 중인 기록/);
  // The status can live on the error's context rather than in its message.
  assert.match(describeStartError({ context: { status: 409 } }), /이미 진행 중인 기록/);
  assert.match(describeStartError({ context: { status: 500 } }), /연결을 확인해 주세요/);
  assert.match(describeStartError(new Error('Network request failed')), /연결이 불안정/);
  assert.match(describeStartError(new Error('timeout')), /연결이 불안정/);
  assert.match(describeStartError(new Error('boom')), /연결을 확인해 주세요/);
  assert.match(describeStartError(undefined), /연결을 확인해 주세요/);
});
