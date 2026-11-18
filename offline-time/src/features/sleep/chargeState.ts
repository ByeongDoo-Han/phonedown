// Battery state for the sleep card. Charging is evidence, not a condition: a sleep record is
// valid without it (the app never asks for a battery permission or for battery-optimisation
// exemptions), and an unknown state — iOS simulator, desktop web — simply shows nothing.

import * as Battery from 'expo-battery';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

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
    // iOS suspends the JS listener while the app is backgrounded, so the state it holds after a
    // night is whatever it last saw. Re-read on every return to the foreground (and the screen
    // reads once more at check-out, when the evidence is actually written).
    const appState = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      void readChargeState().then((fresh) => {
        if (active) setState(fresh);
      });
    });
    return () => {
      active = false;
      subscription?.remove();
      appState.remove();
    };
  }, []);
  return state;
}
