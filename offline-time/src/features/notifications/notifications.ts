// Local notifications for the two moments the app cannot watch for the user: the end of a
// focus goal and the sleep goal's bedtime / wake time. Every call is best-effort — a missing
// permission, a simulator, or a platform without notifications must never break a record.
//
// Web has its own stub (notifications.web.ts) that resolves to 'unsupported'.

import * as Notifications from 'expo-notifications';
import { AndroidImportance, SchedulableTriggerInputTypes } from 'expo-notifications';
import { Platform } from 'react-native';

import {
  focusCompleteCopy, focusCompletionAt, parseClock, sleepReminderCopy,
  type SleepReminderKind,
} from '@/features/notifications/schedule';

export type ReminderStatus = 'scheduled' | 'denied' | 'unsupported' | 'error';
export type ReminderResult = { status: ReminderStatus };

export const notificationsSupported = true;

export const REMINDER_KIND = {
  focus: 'focus_complete',
  bedtime: 'sleep_bedtime',
  waketime: 'sleep_waketime',
} as const;

const CHANNEL_ID = 'offline-time';

// In the foreground the banner still needs to appear: a focus goal often completes while the
// app is open, and the whole point is that the user hears about it without looking.
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
} catch {
  // Expo Go on a platform without the native module: scheduling below reports it instead.
}

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: '오프라인 타임 알림',
      importance: AndroidImportance.DEFAULT,
      sound: 'default',
    });
  } catch {
    // A channel is a nicety; scheduling still works with the default one.
  }
}

async function hasPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    const asked = await Notifications.requestPermissionsAsync();
    return asked.granted;
  } catch {
    return false;
  }
}

async function cancelKind(kind: string) {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const request of scheduled) {
      const data = request.content.data as { kind?: string } | null;
      if (data?.kind !== kind) continue;
      await Notifications.cancelScheduledNotificationAsync(request.identifier);
    }
  } catch {
    // Nothing scheduled, or no native module: there is nothing to cancel either way.
  }
}

export async function cancelFocusComplete(): Promise<void> {
  await cancelKind(REMINDER_KIND.focus);
}

export async function scheduleFocusComplete(input: {
  plannedMinutes: number;
  startedAt: string;
  sessionId: string;
}): Promise<ReminderResult> {
  await ensureChannel();
  if (!(await hasPermission())) return { status: 'denied' };
  const date = focusCompletionAt(input.startedAt, input.plannedMinutes);
  const copy = focusCompleteCopy(input.plannedMinutes);
  try {
    await cancelFocusComplete();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: copy.title,
        body: copy.body,
        sound: 'default',
        data: { kind: REMINDER_KIND.focus, sessionId: input.sessionId },
      },
      trigger: {
        type: SchedulableTriggerInputTypes.DATE,
        date,
        channelId: CHANNEL_ID,
      },
    });
    return { status: 'scheduled' };
  } catch {
    return { status: 'error' };
  }
}

// Replaces both daily sleep reminders in one pass: the enabled kinds are scheduled at the
// goal's clock times, the disabled ones are cleared. Called whenever the goal or a toggle
// changes, so a moved bedtime never leaves yesterday's reminder behind.
export async function syncSleepReminders(input: {
  goal: { bedtime: string; waketime: string };
  bedtime: boolean;
  waketime: boolean;
}): Promise<ReminderResult> {
  if (!input.bedtime && !input.waketime) {
    await cancelKind(REMINDER_KIND.bedtime);
    await cancelKind(REMINDER_KIND.waketime);
    return { status: 'scheduled' };
  }
  await ensureChannel();
  if (!(await hasPermission())) return { status: 'denied' };
  try {
    for (const kind of ['bedtime', 'waketime'] as const) {
      await cancelKind(REMINDER_KIND[kind]);
      if (!input[kind]) continue;
      const clock = parseClock(input.goal[kind === 'bedtime' ? 'bedtime' : 'waketime']);
      if (!clock) continue;
      const copy = sleepReminderCopy(kind as SleepReminderKind, input.goal);
      await Notifications.scheduleNotificationAsync({
        content: {
          title: copy.title,
          body: copy.body,
          sound: 'default',
          data: { kind: REMINDER_KIND[kind] },
        },
        trigger: {
          type: SchedulableTriggerInputTypes.DAILY,
          hour: clock.hour,
          minute: clock.minute,
          channelId: CHANNEL_ID,
        },
      });
    }
    return { status: 'scheduled' };
  } catch {
    return { status: 'error' };
  }
}
