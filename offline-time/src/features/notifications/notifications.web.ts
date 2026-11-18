// Web build: the platform has no local notification scheduler in this app's target set, so
// every call reports 'unsupported' and the screens show an honest line instead of failing.

export type ReminderStatus = 'scheduled' | 'denied' | 'unsupported' | 'error';
export type ReminderResult = { status: ReminderStatus };

export const notificationsSupported = false;

export const REMINDER_KIND = {
  focus: 'focus_complete',
  bedtime: 'sleep_bedtime',
  waketime: 'sleep_waketime',
} as const;

export async function cancelFocusComplete(): Promise<void> {}

export async function scheduleFocusComplete(): Promise<ReminderResult> {
  return { status: 'unsupported' };
}

export async function syncSleepReminders(): Promise<ReminderResult> {
  return { status: 'unsupported' };
}
