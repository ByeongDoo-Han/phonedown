import { create } from 'zustand';

import type { FocusMinutes } from './sessionApi';

type FocusTimerState = {
  selectedMinutes: FocusMinutes;
  nowMs: number;
  selectMinutes: (minutes: FocusMinutes) => void;
  tick: () => void;
};

export const useFocusTimerStore = create<FocusTimerState>((set) => ({
  selectedMinutes: 30,
  nowMs: Date.now(),
  selectMinutes: (selectedMinutes) => set({ selectedMinutes }),
  tick: () => set({ nowMs: Date.now() }),
}));
