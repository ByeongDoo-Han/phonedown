// Sleep reminder switches, remembered on the device. The reminders themselves live in the OS
// scheduler; this hook only holds the user's choice and makes sure the scheduled times match
// the current sleep goal.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

import { notificationsSupported, syncSleepReminders, type ReminderResult } from '@/features/notifications/notifications';

const STORAGE_KEY = 'offline-time.sleep-reminders.v1';

export type SleepReminderPrefs = { bedtime: boolean; waketime: boolean };
const OFF: SleepReminderPrefs = { bedtime: false, waketime: false };

function noticeFor(result: ReminderResult, kind: 'bedtime' | 'waketime', enabled: boolean): string {
  if (result.status === 'scheduled') {
    return enabled
      ? `${kind === 'bedtime' ? '취침' : '기상'} 알림을 켰어요. 매일 같은 시각에 알려드릴게요.`
      : `${kind === 'bedtime' ? '취침' : '기상'} 알림을 껐어요.`;
  }
  if (result.status === 'denied') return '알림 권한이 꺼져 있어요. 휴대폰 설정에서 알림을 허용해 주세요.';
  if (result.status === 'unsupported') return '웹에서는 알림을 예약할 수 없어요. 휴대폰 앱에서 켜 주세요.';
  return '알림을 예약하지 못했어요. 잠시 뒤에 다시 시도해 주세요.';
}

// The clock strings are passed one by one: the screen rebuilds its goal object on every
// render, and an object dependency would reschedule the reminders on every keystroke.
export function useSleepReminders(bedtime: string, waketime: string) {
  const [prefs, setPrefs] = useState<SleepReminderPrefs>(OFF);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [ready, setReady] = useState(false);
  const prefsRef = useRef<SleepReminderPrefs>(OFF);

  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);

  // Restore the switches, then put the reminders back on the OS scheduler: an app update or a
  // reboot can leave a scheduled daily notification behind, and re-syncing is idempotent.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (alive && raw) {
          const stored = JSON.parse(raw) as Partial<SleepReminderPrefs>;
          const next = { bedtime: stored.bedtime === true, waketime: stored.waketime === true };
          prefsRef.current = next;
          setPrefs(next);
        }
      } catch {
        // A corrupt or unavailable store just means "both off".
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  // A new bedtime or wake time while a switch is on moves that daily reminder with it.
  useEffect(() => {
    if (!ready) return;
    const current = prefsRef.current;
    if (!current.bedtime && !current.waketime) return;
    void syncSleepReminders({ goal: { bedtime, waketime }, ...current }).then((result) => {
      if (result.status !== 'scheduled') setNotice(noticeFor(result, current.bedtime ? 'bedtime' : 'waketime', true));
    });
  }, [bedtime, waketime, ready]);

  const toggle = useCallback(async (kind: 'bedtime' | 'waketime') => {
    setNotice('');
    if (!notificationsSupported) {
      setNotice('웹에서는 알림을 예약할 수 없어요. 휴대폰 앱에서 켜 주세요.');
      return;
    }
    const next = { ...prefsRef.current, [kind]: !prefsRef.current[kind] };
    setBusy(true);
    const result = await syncSleepReminders({ goal: { bedtime, waketime }, ...next });
    setBusy(false);
    setNotice(noticeFor(result, kind, next[kind]));
    if (result.status !== 'scheduled') return;
    prefsRef.current = next;
    setPrefs(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // The reminder is already scheduled; only the remembered switch is lost.
    }
  }, [bedtime, waketime]);

  return { prefs, busy, notice, toggle };
}
