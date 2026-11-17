// Battery state for the sleep card. Charging is evidence, not a condition: a sleep record is
// valid without it (the app never asks for a battery permission or for battery-optimisation
// exemptions), and an unknown state — iOS simulator, desktop web — simply shows nothing.

import * as Battery from 'expo-battery';
import { useEffect, useState } from 'react';

export type ChargeState = 'charging' | 'unplugged' | 'unknown';

export function toChargeState(state: Battery.BatteryState | null | undefined): ChargeState {
  if (state === Battery.BatteryState.CHARGING || state === Battery.BatteryState.FULL) {
    return 'charging';
  }
  if (state === Battery.BatteryState.UNPLUGGED) return 'unplugged';
  return 'unknown';
}

// The value the API stores on a session: null when the device could not tell us.
export function chargeFlag(state: ChargeState): boolean | null {
  if (state === 'charging') return true;
  if (state === 'unplugged') return false;
  return null;
}

export async function readChargeState(): Promise<ChargeState> {
  try {
    return toChargeState(await Battery.getBatteryStateAsync());
  } catch {
    return 'unknown';
  }
}

export function useChargeState(): ChargeState {
  const [state, setState] = useState<ChargeState>('unknown');
  useEffect(() => {
    let active = true;
    void readChargeState().then((next) => {
      if (active) setState(next);
    });
    let subscription: { remove: () => void } | null = null;
    try {
      subscription = Battery.addBatteryStateListener(({ batteryState }) => {
        if (active) setState(toChargeState(batteryState));
      });
    } catch {
      // Web and some simulators have no state listener; the one-off read above still applies.
      subscription = null;
    }
    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);
  return state;
}

export function chargeLabel(state: ChargeState): string {
  if (state === 'charging') return '충전 연결됨 · 화면을 꺼도 시간은 계속 쌓여요';
  if (state === 'unplugged') return '충전기가 연결되지 않았어요. 꽂으면 그때부터 기록돼요';
  return '이 기기에서는 충전 상태를 확인할 수 없어요. 수면 기록은 그대로 할 수 있어요';
}
