// iOS Live Activity bridge for a running record.
//
// `expo-widgets` (SDK 58) needs a development build: its native module is absent in Expo Go, on
// Android and on web. Nothing here may therefore throw — the module is loaded lazily inside a
// try/catch, every native call is wrapped, and the outcome is always a plain string the screen
// can ignore. Web has its own stub (`liveActivity.web.ts`).

import type { LiveActivity, LiveActivityFactory } from 'expo-widgets';
import { Platform } from 'react-native';

import { activityKey, type SessionActivityProps } from './payload';

export type LiveActivityOutcome =
  | 'started'
  | 'updated'
  | 'ended'
  | 'unsupported'
  | 'error'
  | 'skipped';

type WidgetsModule = typeof import('expo-widgets');

// How long the settled state stays on the lock screen before the system removes it.
const FINAL_LINGER_MS = 30_000;

let loadedModule: WidgetsModule | null | undefined;
let factory: LiveActivityFactory<SessionActivityProps> | null = null;
let current: LiveActivity<SessionActivityProps> | null = null;
let currentKey = 'none';
let settledAtMs = 0;

// Live Activities can be switched off for the app in iOS Settings even when the module is
// there. A rejected start turns the feature off for this launch so the screen stops promising
// a lock-screen timer it cannot show. Exposed as a tiny store so React can subscribe.
let unavailable = false;
const availabilityListeners = new Set<() => void>();

export function subscribeLiveActivityAvailability(listener: () => void): () => void {
  availabilityListeners.add(listener);
  return () => {
    availabilityListeners.delete(listener);
  };
}

export function liveActivityAvailable(): boolean {
  return !unavailable && liveActivitySupported();
}

function markUnavailable() {
  if (unavailable) return;
  unavailable = true;
  for (const listener of availabilityListeners) listener();
}

function loadModule(): WidgetsModule | null {
  if (loadedModule !== undefined) return loadedModule;
  loadedModule = null;
  if (Platform.OS !== 'ios') return loadedModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loadedModule = require('expo-widgets') as WidgetsModule;
  } catch {
    // Expo Go or a binary built before this feature: no ExpoWidgets module.
    loadedModule = null;
  }
  return loadedModule;
}

function factoryOrNull(): LiveActivityFactory<SessionActivityProps> | null {
  if (factory) return factory;
  if (!loadModule()) return null;
  try {
    // The layout module pulls in `@expo/ui/swift-ui`, so it is required only once we know the
    // native side exists.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const layout = require('./sessionActivityLayout') as {
      default: LiveActivityFactory<SessionActivityProps>;
    };
    factory = layout.default;
  } catch {
    factory = null;
  }
  return factory;
}

function liveInstances(activeFactory: LiveActivityFactory<SessionActivityProps>) {
  try {
    return activeFactory.getInstances();
  } catch {
    return [];
  }
}

function isUnsupported(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error ?? '');
  return /not supported|not available|areActivitiesEnabled|disabled/i.test(text);
}

function endOne(activity: LiveActivity<SessionActivityProps>, finalProps: SessionActivityProps | null) {
  const after = loadModule()?.after(new Date(Date.now() + FINAL_LINGER_MS)) ?? 'default';
  try {
    void activity.end(after, finalProps ?? undefined, new Date()).catch(() => {});
  } catch {
    // The activity already ended (user swiped it away, or the system dismissed it).
  }
}

function endAll(activeFactory: LiveActivityFactory<SessionActivityProps>,
  finalProps: SessionActivityProps | null) {
  for (const activity of liveInstances(activeFactory)) endOne(activity, finalProps);
  current = null;
  currentKey = 'none';
}

export function liveActivitySupported(): boolean {
  return Platform.OS === 'ios' && loadModule() !== null;
}

// Brings the lock screen in line with the app: start when a record begins, refresh the content
// when the record or its goal changes, and end whatever is left when no record is open.
export function syncSessionActivity(props: SessionActivityProps | null): LiveActivityOutcome {
  if (Platform.OS !== 'ios') return 'unsupported';
  const activeFactory = factoryOrNull();
  if (!activeFactory) return 'unsupported';

  try {
    if (!props) {
      // A settlement just took the activity down on purpose; do not cut its goodbye short.
      if (Date.now() - settledAtMs < FINAL_LINGER_MS) return 'skipped';
      if (!current && liveInstances(activeFactory).length === 0) return 'skipped';
      endAll(activeFactory, null);
      return 'ended';
    }

    const instances = liveInstances(activeFactory);
    if (current && !instances.some((activity) => activity.getId() === current?.getId())) {
      current = null;
    }
    if (!current) current = instances[0] ?? null;

    // More than one activity can survive a crash-loop of starts; keep the one we adopt.
    const adopted = current;
    if (adopted) {
      for (const extra of instances) {
        if (extra.getId() !== adopted.getId()) endOne(extra, null);
      }
    }

    if (!current) {
      current = activeFactory.start(props);
      currentKey = activityKey(props);
      return 'started';
    }

    const key = activityKey(props);
    if (key === currentKey) return 'skipped';
    currentKey = key;
    void current.update(props).catch(() => {});
    return 'updated';
  } catch (error) {
    if (!isUnsupported(error)) return 'error';
    markUnavailable();
    return 'unsupported';
  }
}

// The morning check-out (or a focus session's end): the activity closes with the record's
// summary instead of disappearing mid-read.
export function finishSessionActivity(props: SessionActivityProps | null): LiveActivityOutcome {
  if (Platform.OS !== 'ios') return 'unsupported';
  const activeFactory = factoryOrNull();
  if (!activeFactory) return 'unsupported';
  try {
    endAll(activeFactory, props);
    settledAtMs = Date.now();
    return 'ended';
  } catch (error) {
    if (!isUnsupported(error)) return 'error';
    markUnavailable();
    return 'unsupported';
  }
}
