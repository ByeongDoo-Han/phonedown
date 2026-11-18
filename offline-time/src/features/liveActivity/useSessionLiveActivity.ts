// Keeps the iOS Live Activity on the running record. The hook is driven by the sessions query
// (the same row the timer is drawn from), so a start, a relaunch mid-night and a settlement all
// converge on the same content.

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import type { TimeSession } from '@/features/session/sessionApi';
import type { SleepGoal } from '@/features/sleep/sleepGoal';

import {
  liveActivityAvailable, subscribeLiveActivityAvailability, syncSessionActivity,
} from './liveActivity';
import { sessionActivityProps } from './payload';

export function useSessionLiveActivity(input: {
  /** Only act once the record list has loaded — otherwise an empty list means "loading", not
   * "no record", and a running night's activity would be torn down on every launch. */
  ready: boolean;
  session: TimeSession | undefined;
  goal: SleepGoal;
}): boolean {
  const { ready, session, goal } = input;
  // The native module may exist while the system has Live Activities switched off for this app;
  // a rejected start drops the screen's "잠금화면에서도" line instead of promising it.
  const supported = useSyncExternalStore(subscribeLiveActivityAvailability, liveActivityAvailable,
    () => false);

  const bedtime = goal.bedtime;
  const waketime = goal.waketime;

  const resync = useCallback(() => {
    if (!ready) return;
    if (!session) {
      syncSessionActivity(null);
      return;
    }
    const props = sessionActivityProps({
      mode: session.mode,
      serverStartedAt: session.server_started_at,
      plannedMinutes: session.planned_minutes,
      goal: { bedtime, waketime },
    });
    if (!props) return;
    syncSessionActivity(props);
  }, [ready, session, bedtime, waketime]);

  useEffect(() => {
    resync();
  }, [resync]);

  // A phone that was asleep all night resumes with a stale guess about the world; re-reading on
  // foreground refreshes the note (for example once the wake target has passed).
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') resync();
    });
    return () => subscription.remove();
  }, [resync]);

  return supported;
}
