import assert from 'node:assert/strict';
import test from 'node:test';

import { AD_REWARD_POLL_ATTEMPTS, AD_REWARD_POLL_INTERVAL_MS, AD_REWARD_WAIT_MS,
  adRewardClaimFor, adRewardDeniedNotice, adRewardPendingKey, adRewardPendingLabel,
  adRewardWatchOutcome, watchAdReward } from '../src/features/points/adRewardWatch.ts';

const SESSION = '8a2c0a16-3a4e-4d2f-9f0e-6c1b2f3a4b5c';

async function flush() {
  for (let index = 0; index < 5; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

// The watch injects its scheduler, so the cadence runs on a clock the test owns.
function fakeClock() {
  let now = 0;
  let sequence = 0;
  const timers = [];
  const schedule = (run, ms) => {
    const timer = { id: (sequence += 1), at: now + ms, run };
    timers.push(timer);
    return timer;
  };
  const cancel = (timer) => {
    const index = timers.indexOf(timer);
    if (index >= 0) timers.splice(index, 1);
  };
  const next = async () => {
    if (timers.length === 0) return false;
    timers.sort((left, right) => left.at - right.at || left.id - right.id);
    const timer = timers.shift();
    now = timer.at;
    timer.run();
    await flush();
    return true;
  };
  return {
    schedule, cancel, next,
    get now() { return now; },
    get pending() { return timers.length; },
  };
}

function claim(overrides) {
  return {
    id: 'claim-1', kind: 'settlement_booster', session_id: SESSION, week_id: '2026-W47',
    bonus_points: 4, denied_reason: null, claim_day: '2026-11-18',
    created_at: '2026-11-18T02:00:00Z', ...overrides,
  };
}

test('the wait re-reads the ledger five times, two seconds apart', () => {
  assert.equal(AD_REWARD_POLL_ATTEMPTS, 5);
  assert.equal(AD_REWARD_POLL_INTERVAL_MS, 2000);
  assert.equal(AD_REWARD_WAIT_MS, 10_000);
});

test('each placement keeps its own key and busy label', () => {
  assert.equal(adRewardPendingKey({ kind: 'settlement_booster', sessionId: SESSION }),
    `settlement_booster:${SESSION}`);
  assert.equal(adRewardPendingKey({ kind: 'weekly_box' }), 'weekly_box');
  assert.notEqual(adRewardPendingKey({ kind: 'weekly_box' }),
    adRewardPendingKey({ kind: 'settlement_booster', sessionId: SESSION }));
  assert.equal(adRewardPendingLabel({ kind: 'settlement_booster', sessionId: SESSION }), '부스터 확인 중…');
  assert.equal(adRewardPendingLabel({ kind: 'weekly_box' }), '상자 확인 중…');
});

test('a booster stays pending until its claim row arrives', () => {
  const placement = { kind: 'settlement_booster', sessionId: SESSION };
  assert.equal(adRewardWatchOutcome([], placement, null), 'pending');
  // Another session's booster is not this one's answer.
  assert.equal(adRewardWatchOutcome([claim({ session_id: 'other-session' })], placement, null), 'pending');
  // The weekly box row does not answer a booster either.
  assert.equal(adRewardWatchOutcome([claim({ kind: 'weekly_box', session_id: null })], placement, null),
    'pending');
  assert.equal(adRewardWatchOutcome([claim({})], placement, null), 'granted');
});

test('a refused booster releases the button as denied', () => {
  const placement = { kind: 'settlement_booster', sessionId: SESSION };
  const daily = claim({ bonus_points: 0, denied_reason: 'daily_limit' });
  assert.equal(adRewardWatchOutcome([daily], placement, null), 'denied');
  assert.equal(adRewardClaimFor([daily], placement, null), daily);
});

test('the weekly box only answers for the settled week', () => {
  const placement = { kind: 'weekly_box' };
  // Without a settled week there is no box to open, so nothing can confirm it.
  assert.equal(adRewardWatchOutcome([claim({ kind: 'weekly_box', session_id: null, week_id: '2026-W46' })],
    placement, null), 'pending');
  // An older week's box is not the box the user just opened.
  assert.equal(adRewardWatchOutcome([claim({ kind: 'weekly_box', session_id: null, week_id: '2026-W46' })],
    placement, '2026-W47'), 'pending');
  assert.equal(adRewardWatchOutcome([claim({ kind: 'weekly_box', session_id: null, week_id: '2026-W47',
    bonus_points: 80 })], placement, '2026-W47'), 'granted');
  assert.equal(adRewardWatchOutcome([claim({ kind: 'weekly_box', session_id: null, week_id: '2026-W47',
    bonus_points: 0, denied_reason: 'weekly_booster_cap' })], placement, '2026-W47'), 'denied');
  assert.equal(adRewardClaimFor([claim({ kind: 'weekly_box', session_id: null, week_id: '2026-W47' })],
    placement, '2026-W47')?.bonus_points, 4);
});

test('the refusal is explained in the user’s words, with a fallback', () => {
  assert.match(adRewardDeniedNotice('daily_limit'), /오늘 광고 부스터를 모두 받아서/);
  assert.match(adRewardDeniedNotice('weekly_booster_cap'), /이번 주 광고 보너스 한도를 모두 채워서/);
  assert.match(adRewardDeniedNotice(null), /광고 보상이 지급되지 않았어요/);
  assert.match(adRewardDeniedNotice('something_new'), /광고 보상이 지급되지 않았어요/);
});

test('the watch releases the button as soon as the claim row lands', async () => {
  const clock = fakeClock();
  const readAt = [];
  const results = [];
  const stop = watchAdReward({
    placement: { kind: 'settlement_booster', sessionId: SESSION },
    settledWeekId: null,
    readClaims: async () => {
      readAt.push(clock.now);
      return readAt.length >= 3 ? [claim({})] : [];
    },
    onSettled: (result) => results.push(result),
    schedule: clock.schedule,
    cancel: clock.cancel,
  });
  while (await clock.next());
  stop();
  assert.deepEqual(readAt, [2000, 4000, 6000]);
  assert.deepEqual(results, [{ status: 'granted' }]);
  assert.equal(clock.pending, 0);
});

test('a wait that never sees a row gives up after five reads and reports it', async () => {
  const clock = fakeClock();
  const readAt = [];
  const results = [];
  const stop = watchAdReward({
    placement: { kind: 'weekly_box' },
    settledWeekId: '2026-W47',
    readClaims: async () => {
      readAt.push(clock.now);
      return [];
    },
    onSettled: (result) => results.push(result),
    schedule: clock.schedule,
    cancel: clock.cancel,
  });
  while (await clock.next());
  stop();
  assert.equal(readAt.length, AD_REWARD_POLL_ATTEMPTS);
  assert.deepEqual(readAt, [2000, 4000, 6000, 8000, 10_000]);
  assert.equal(readAt.at(-1), AD_REWARD_WAIT_MS);
  assert.deepEqual(results, [{ status: 'timeout' }]);
  assert.equal(clock.pending, 0);
});

test('a refused claim ends the wait with its reason', async () => {
  const clock = fakeClock();
  const results = [];
  const stop = watchAdReward({
    placement: { kind: 'settlement_booster', sessionId: SESSION },
    settledWeekId: null,
    readClaims: async () => [claim({ bonus_points: 0, denied_reason: 'daily_limit' })],
    onSettled: (result) => results.push(result),
    schedule: clock.schedule,
    cancel: clock.cancel,
  });
  while (await clock.next());
  stop();
  assert.deepEqual(results, [{ status: 'denied', reason: 'daily_limit' }]);
});

test('a read that fails is not the end of the wait', async () => {
  const clock = fakeClock();
  let reads = 0;
  const results = [];
  const stop = watchAdReward({
    placement: { kind: 'settlement_booster', sessionId: SESSION },
    settledWeekId: null,
    readClaims: async () => {
      reads += 1;
      if (reads === 1) throw new Error('network down');
      return [claim({})];
    },
    onSettled: (result) => results.push(result),
    schedule: clock.schedule,
    cancel: clock.cancel,
  });
  while (await clock.next());
  stop();
  assert.equal(reads, 2);
  assert.deepEqual(results, [{ status: 'granted' }]);
});

test('stopping the watch clears its timer before the next read', async () => {
  const clock = fakeClock();
  let reads = 0;
  const stop = watchAdReward({
    placement: { kind: 'weekly_box' },
    settledWeekId: '2026-W47',
    readClaims: async () => { reads += 1; return []; },
    onSettled: () => {},
    schedule: clock.schedule,
    cancel: clock.cancel,
  });
  assert.equal(clock.pending, 1);
  stop();
  assert.equal(clock.pending, 0);
  while (await clock.next());
  assert.equal(reads, 0);
});
