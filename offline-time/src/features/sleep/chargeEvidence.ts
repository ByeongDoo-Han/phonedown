// What the sleep card says about the charger, and what evidence a settlement should carry.
//
// Charging is evidence, not a condition: the app never asks for a battery permission or an
// optimisation exemption, and an unknown reading (simulator, some Androids, web) hides the hint
// instead of blocking a record. Kept free of React and native modules so `node --test` can
// check the rules.

import type { ChargeState } from './chargeState';

export type SleepStartOffer = { title: string; body: string; action: string };

// The one-tap offer: only while the charger is connected and nothing is being recorded.
export function sleepStartOffer(input: {
  charge: ChargeState;
  hasOpenSession: boolean;
}): SleepStartOffer | null {
  if (input.hasOpenSession) return null;
  if (input.charge !== 'charging') return null;
  return {
    title: '충전기 연결됨',
    body: '지금 누르면 아침까지 수면 기록이 이어져요. 화면을 꺼도 괜찮아요.',
    action: '수면 기록 시작',
  };
}

// The line under the sleep timer (recording) or under the start button (not recording yet).
export function sleepChargeNote(charge: ChargeState, recording: boolean): string {
  if (recording) {
    if (charge === 'charging') return '충전 중 · 화면을 꺼도 기록은 계속 쌓여요';
    if (charge === 'unplugged') return '충전이 풀렸어요 · 기록은 그대로 이어져요';
    return '이 기기에서는 충전 상태를 확인할 수 없어요 · 수면 기록은 그대로예요';
  }
  if (charge === 'charging') return '충전기 연결됨 · 수면 기록을 시작할까요?';
  if (charge === 'unplugged') return '충전기가 연결되지 않았어요. 꽂으면 그때부터 기록돼요';
  return '이 기기에서는 충전 상태를 확인할 수 없어요. 수면 기록은 그대로 할 수 있어요';
}

// What a settlement stores as `ended_charging`. The reading taken at check-out is the evidence;
// the value the screen has been showing since the app was last awake is only the fallback,
// because iOS suspends the JS battery listener overnight.
export function endChargingFlag(fresh: ChargeState, observed: ChargeState): boolean | null {
  const state = fresh !== 'unknown' ? fresh : observed;
  if (state === 'charging') return true;
  if (state === 'unplugged') return false;
  return null;
}

export type ChargeTransition = 'plugged' | 'unplugged' | null;

// A change worth telling the user about while a night is being recorded.
export function chargeTransition(previous: ChargeState, next: ChargeState): ChargeTransition {
  if (previous === next) return null;
  if (next === 'unplugged' && previous === 'charging') return 'unplugged';
  if (next === 'charging' && previous === 'unplugged') return 'plugged';
  return null;
}

export function chargeChangeNotice(transition: ChargeTransition): string | null {
  if (transition === 'unplugged') {
    return '충전이 풀렸어요. 기록은 그대로 이어지고, 아침 정산에 충전 해제도 함께 남겨요.';
  }
  if (transition === 'plugged') return '충전기가 다시 연결됐어요. 아침 정산에 충전 상태로 남겨요.';
  return null;
}
