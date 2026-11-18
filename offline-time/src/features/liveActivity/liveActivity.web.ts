// Web build: there is no Live Activity surface, so every call reports 'unsupported' and the
// screens simply do not mention the lock screen.

import type { SessionActivityProps } from './payload';

export type LiveActivityOutcome =
  | 'started'
  | 'updated'
  | 'ended'
  | 'unsupported'
  | 'error'
  | 'skipped';

export function liveActivitySupported(): boolean {
  return false;
}

export function subscribeLiveActivityAvailability(_listener: () => void): () => void {
  return () => {};
}

export function liveActivityAvailable(): boolean {
  return false;
}

export function syncSessionActivity(_props: SessionActivityProps | null): LiveActivityOutcome {
  return 'unsupported';
}

export function finishSessionActivity(_props: SessionActivityProps | null): LiveActivityOutcome {
  return 'unsupported';
}
