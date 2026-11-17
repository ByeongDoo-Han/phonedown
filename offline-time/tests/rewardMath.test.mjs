import assert from 'node:assert/strict';
import test from 'node:test';

import { boosterBonus, boosterState, currentWeekId, formatPointRate, kstDayString, krwForPoints,
  pointsForKrw, weeklyAllowance, weeklyBoxState } from '../src/features/points/rewardMath.ts';

test('the ad booster adds the session base points again', () => {
  assert.equal(boosterBonus(7, 2), 7);
  assert.equal(boosterBonus(1, 2), 1);
  assert.equal(boosterBonus(3, 2.5), 4);
  assert.equal(boosterBonus(0, 2), 0);
  assert.equal(boosterBonus(5, 1), 0);
});

test('a pending session with base points can be boosted', () => {
  assert.deepEqual(boosterState({
    basePoints: 7, multiplier: 2, claimedBonus: null, claimsToday: 0, dailyMax: 2,
    settled: false, enabled: true,
  }), { status: 'ready', bonusPoints: 7 });
});

test('an already boosted session shows the granted bonus', () => {
  assert.deepEqual(boosterState({
    basePoints: 7, multiplier: 2, claimedBonus: 7, claimsToday: 2, dailyMax: 2,
    settled: true, enabled: true,
  }), { status: 'claimed', bonusPoints: 7 });
});

test('a session without base points cannot be boosted', () => {
  assert.equal(boosterState({
    basePoints: 0, multiplier: 2, claimedBonus: null, claimsToday: 0, dailyMax: 2,
    settled: false, enabled: true,
  }).status, 'no-base');
});

test('settled sessions and the daily limit close the booster', () => {
  assert.equal(boosterState({
    basePoints: 7, multiplier: 2, claimedBonus: null, claimsToday: 0, dailyMax: 2,
    settled: true, enabled: true,
  }).status, 'closed');
  assert.equal(boosterState({
    basePoints: 7, multiplier: 2, claimedBonus: null, claimsToday: 2, dailyMax: 2,
    settled: false, enabled: true,
  }).status, 'limit');
  assert.equal(boosterState({
    basePoints: 7, multiplier: 2, claimedBonus: null, claimsToday: 0, dailyMax: 2,
    settled: false, enabled: false,
  }).status, 'disabled');
});

test('the weekly box opens once per settled week', () => {
  assert.deepEqual(weeklyBoxState({
    enabled: true, settledWeekId: '2026-W46', claimedWeekId: null, bonusPoints: 20,
  }), { status: 'ready', weekId: '2026-W46', bonusPoints: 20 });
  assert.equal(weeklyBoxState({
    enabled: true, settledWeekId: '2026-W46', claimedWeekId: '2026-W46', bonusPoints: 20,
  }).status, 'claimed');
  assert.equal(weeklyBoxState({
    enabled: true, settledWeekId: null, claimedWeekId: null, bonusPoints: 20,
  }).status, 'locked');
  assert.equal(weeklyBoxState({
    enabled: false, settledWeekId: '2026-W46', claimedWeekId: null, bonusPoints: 20,
  }).status, 'disabled');
});

test('points convert at 1,400P = 1,000원', () => {
  assert.equal(krwForPoints(1400, 1400), 1000);
  assert.equal(krwForPoints(700, 1400), 500);
  assert.equal(krwForPoints(2900, 1400), 2071);
  assert.equal(krwForPoints(0, 1400), 0);
  assert.equal(pointsForKrw(1000, 1400), 1400);
  assert.equal(pointsForKrw(3000, 1400), 4200);
  assert.equal(formatPointRate(0.714), '0.71원');
  assert.equal(formatPointRate(1), '1원');
});

test('the claim day follows KST midnight', () => {
  assert.equal(kstDayString(new Date('2026-11-17T14:59:00.000Z')), '2026-11-17');
  assert.equal(kstDayString(new Date('2026-11-17T15:00:00.000Z')), '2026-11-18');
});

test('the week id matches the server ISO week in KST', () => {
  assert.equal(currentWeekId(new Date('2026-11-17T10:58:00.000Z')), '2026-W47');
  assert.equal(currentWeekId(new Date('2026-11-15T14:59:00.000Z')), '2026-W46');
  assert.equal(currentWeekId(new Date('2026-11-15T15:00:00.000Z')), '2026-W47');
  assert.equal(currentWeekId(new Date('2027-01-01T00:00:00.000Z')), '2026-W53');
});

test('the week splits into a 100P base earn and an 80P ad booster pool', () => {
  const cap = { base_points: 100, booster_points: 80 };
  assert.deepEqual(weeklyAllowance({ basePoints: 42, bonusPoints: 20, cap }), {
    baseEarned: 42, baseRemaining: 58, bonusEarned: 20, bonusRemaining: 60,
    totalEarned: 62, totalCap: 180,
  });
  assert.deepEqual(weeklyAllowance({ basePoints: 100, bonusPoints: 80, cap }), {
    baseEarned: 100, baseRemaining: 0, bonusEarned: 80, bonusRemaining: 0,
    totalEarned: 180, totalCap: 180,
  });
  assert.deepEqual(weeklyAllowance({ basePoints: 0, bonusPoints: 0, cap }), {
    baseEarned: 0, baseRemaining: 100, bonusEarned: 0, bonusRemaining: 80,
    totalEarned: 0, totalCap: 180,
  });
  // A booster never eats into the base earn and the other way round.
  assert.equal(weeklyAllowance({ basePoints: 100, bonusPoints: 0, cap }).bonusRemaining, 80);
  assert.equal(weeklyAllowance({ basePoints: 0, bonusPoints: 80, cap }).baseRemaining, 100);
});
