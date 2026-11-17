import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateFocusEnd, parseClientTime } from '../supabase/functions/_shared/focusRules.ts';

const start = '2026-11-17T00:00:00.000Z';
const atMinutes = (minutes) => Date.parse(start) + minutes * 60_000;

test('client timestamps outside the allowed clock skew are rejected', () => {
  const now = atMinutes(1);
  assert.equal(parseClientTime(new Date(now - 120_000).toISOString(), now),
    new Date(now - 120_000).toISOString());
  assert.equal(parseClientTime(new Date(now + 120_001).toISOString(), now), null);
  assert.equal(parseClientTime('not a date', now), null);
});

test('a focus session below 20 minutes is stored as invalid', () => {
  assert.deepEqual(evaluateFocusEnd(start, atMinutes(19), true), {
    serverEndedAt: new Date(atMinutes(19)).toISOString(),
    status: 'invalid',
    invalidReason: 'too_short',
  });
});

test('a 20 minute session is valid and sessions over three hours are capped', () => {
  assert.equal(evaluateFocusEnd(start, atMinutes(20), true).status, 'valid');
  assert.deepEqual(evaluateFocusEnd(start, atMinutes(181), true), {
    serverEndedAt: new Date(atMinutes(180)).toISOString(),
    status: 'valid',
    invalidReason: null,
  });
});

test('clock skew makes a session invalid even after 20 minutes', () => {
  assert.equal(evaluateFocusEnd(start, atMinutes(30), false).invalidReason, 'clock_skew');
});
