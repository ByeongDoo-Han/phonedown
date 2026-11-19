import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { Card, SectionHeader } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { LabeledBar, ProgressBar } from '@/components/ProgressBar';
import { Notice, Pill } from '@/components/Pill';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/features/auth/AuthProvider';
import { saveSleepGoal, useProfile } from '@/features/auth/useProfile';
import { finishSessionActivity } from '@/features/liveActivity/liveActivity';
import { settledActivityProps } from '@/features/liveActivity/payload';
import { useSessionLiveActivity } from '@/features/liveActivity/useSessionLiveActivity';
import { cancelFocusComplete, scheduleFocusComplete } from '@/features/notifications/notifications';
import { useSleepReminders } from '@/features/notifications/useSleepReminders';
import { listPointTransactions, pointTransactionsQueryKey } from '@/features/points/pointApi';
import { DEFAULT_POINT_RULES, getPointRules, pointRulesQueryKey } from '@/features/points/pointRulesApi';
import { currentWeekId, weeklyAllowance } from '@/features/points/rewardMath';
import { useFocusTimerStore } from '@/features/session/focusTimerStore';
import { endSession, listSessions, sessionQueryKey, startSession,
  type FocusMinutes, type TimeSession } from '@/features/session/sessionApi';
import { describeStartError, optimisticSession } from '@/features/session/optimistic';
import { chargeChangeNotice, chargeTransition, endChargingFlag, sleepChargeNote,
  sleepStartOffer } from '@/features/sleep/chargeEvidence';
import { chargeFlag, readChargeState, useChargeState } from '@/features/sleep/chargeState';
import { BEDTIME_CHOICES, WAKETIME_CHOICES, formatGoalMinutes,
  goalFromProfile, goalMinutes, kstMinutes, preferredMode, type SleepGoal } from '@/features/sleep/sleepGoal';
import { walletQueryKey } from '@/features/store/storeApi';
import { tokens } from '@/theme/tokens';

const labels = { sleep: '수면', focus: '집중', both: '수면과 집중' };
const plans: FocusMinutes[] = [30, 60, 90];
type IconName = ComponentProps<typeof Ionicons>['name'];
const modes: { mode: 'focus' | 'sleep'; icon: IconName; iconOutline: IconName; label: string }[] = [
  { mode: 'focus', icon: 'flash', iconOutline: 'flash-outline', label: '집중' },
  { mode: 'sleep', icon: 'moon', iconOutline: 'moon-outline', label: '수면' },
];

function formatElapsed(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return `${hours > 0 ? `${String(hours).padStart(2, '0')}:` : ''}${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function chargeIcon(state: 'charging' | 'unplugged' | 'unknown'): IconName {
  if (state === 'charging') return 'battery-charging-outline';
  if (state === 'unplugged') return 'battery-dead-outline';
  return 'battery-half-outline';
}

export default function Home() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const profile = useProfile(userId);
  const primary = profile.data?.primary_mode ?? 'both';
  const savedGoal = goalFromProfile(profile.data?.sleep_bedtime, profile.data?.sleep_waketime);
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState('');
  const [feedbackTone, setFeedbackTone] = useState<'accent' | 'danger'>('accent');
  const [modeChoice, setModeChoice] = useState<'sleep' | 'focus' | null>(null);
  const [goalDraft, setGoalDraft] = useState<SleepGoal | null>(null);
  const goal = goalDraft ?? savedGoal;
  const chargeState = useChargeState();
  const reminders = useSleepReminders(goal.bedtime, goal.waketime);
  const selectedMinutes = useFocusTimerStore((state) => state.selectedMinutes);
  const selectMinutes = useFocusTimerStore((state) => state.selectMinutes);
  const nowMs = useFocusTimerStore((state) => state.nowMs);
  const tick = useFocusTimerStore((state) => state.tick);
  const rules = useQuery({ queryKey: pointRulesQueryKey, queryFn: getPointRules,
    staleTime: 5 * 60_000 });
  const pointRules = rules.data ?? DEFAULT_POINT_RULES;
  const sessions = useQuery({
    queryKey: sessionQueryKey(userId),
    enabled: !!userId,
    queryFn: () => listSessions(userId!),
  });
  const points = useQuery({
    queryKey: pointTransactionsQueryKey(userId),
    enabled: !!userId,
    queryFn: () => listPointTransactions(userId!),
  });
  const active = sessions.data?.find((item) => item.status === 'open');
  // The lock screen follows the same row the timer does: it appears with the start, survives a
  // relaunch mid-night, and takes its settled state from the check-out below.
  const liveActivityOn = useSessionLiveActivity({
    ready: sessions.isSuccess,
    session: active,
    goal,
  });
  const chargingOffer = sleepStartOffer({ charge: chargeState, hasOpenSession: !!active });
  // iOS suspends the battery listener while the app is backgrounded; the note about a charger
  // that came loose overnight is built from the transition the app can actually observe.
  const previousCharge = useRef(chargeState);
  const [chargeNotice, setChargeNotice] = useState('');
  useEffect(() => {
    const transition = active?.mode === 'sleep'
      ? chargeTransition(previousCharge.current, chargeState)
      : null;
    previousCharge.current = chargeState;
    const notice = chargeChangeNotice(transition);
    if (notice) setChargeNotice(notice);
  }, [chargeState, active?.mode]);
  // Before the user picks a mode, the clock decides: a night-time sleep user opens on sleep.
  const chosen = active?.mode ?? modeChoice ?? preferredMode(primary, kstMinutes(), savedGoal);
  const isNight = chosen === 'sleep';
  const week = currentWeekId();
  const weekBase = (points.data ?? [])
    .filter((item) => item.week_id === week && item.kind !== 'bonus')
    .reduce((sum, item) => sum + item.amount, 0);
  const weekBonus = (points.data ?? [])
    .filter((item) => item.week_id === week && item.kind === 'bonus' && item.bonus_pool === 'ad')
    .reduce((sum, item) => sum + item.amount, 0);
  const allowance = weeklyAllowance({ basePoints: weekBase, bonusPoints: weekBonus,
    cap: pointRules.weekly });

  useEffect(() => {
    if (!active) return;
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [active, tick]);

  const showFeedback = (message: string, tone: 'accent' | 'danger' = 'accent') => {
    setFeedbackTone(tone);
    setFeedback(message);
  };

  const setSessions = (update: (current: TimeSession[]) => TimeSession[]) => {
    queryClient.setQueryData<TimeSession[]>(sessionQueryKey(userId), (current) => update(current ?? []));
  };

  const start = useMutation({
    mutationFn: (mode: 'sleep' | 'focus') => startSession(
      mode === 'sleep'
        ? { mode: 'sleep', plannedMinutes: goalMinutes(goal.bedtime, goal.waketime) }
        : { mode: 'focus', plannedMinutes: selectedMinutes },
      chargeFlag(chargeState)),
    // Optimistic: the timer screen is on before the network round trip finishes.
    onMutate: async (mode) => {
      setFeedback('');
      await queryClient.cancelQueries({ queryKey: sessionQueryKey(userId) });
      const previous = queryClient.getQueryData<TimeSession[]>(sessionQueryKey(userId));
      const startedAt = new Date().toISOString();
      const optimistic = optimisticSession({
        id: `pending-${startedAt}`,
        userId: userId!,
        mode,
        plannedMinutes: mode === 'sleep' ? goalMinutes(goal.bedtime, goal.waketime) : selectedMinutes,
        startedAt,
        charging: chargeFlag(chargeState),
      });
      setSessions((current) => [optimistic, ...current]);
      tick();
      return { previous, optimisticId: optimistic.id, mode };
    },
    onSuccess: (created, _mode, context) => {
      setSessions((current) => [created,
        ...current.filter((item) => item.id !== created.id && item.id !== context?.optimisticId)]);
      setModeChoice(created.mode);
      showFeedback(created.mode === 'sleep'
        ? '수면 기록을 시작했어요. 아침에 일어나면 한 번만 눌러 주세요.'
        : '집중 기록을 시작했습니다.');
      if (created.mode === 'focus' && created.planned_minutes) {
        // The goal completion lands even if the app is closed; the server clock is the base.
        void scheduleFocusComplete({
          plannedMinutes: created.planned_minutes,
          startedAt: created.server_started_at,
          sessionId: created.id,
        });
      }
    },
    onError: (error, _mode, context) => {
      if (context?.previous) {
        queryClient.setQueryData(sessionQueryKey(userId), context.previous);
      } else {
        setSessions((current) => current.filter((item) => item.id !== context?.optimisticId));
      }
      showFeedback(describeStartError(error), 'danger');
    },
    onSettled: () => { void queryClient.invalidateQueries({ queryKey: sessionQueryKey(userId) }); },
  });

  const end = useMutation({
    // The charger reading at check-out is the evidence the morning settlement keeps: read the
    // device again instead of trusting a listener that slept through the night.
    mutationFn: async (item: TimeSession) => {
      const fresh = await readChargeState();
      return endSession(item.id, endChargingFlag(fresh, chargeState));
    },
    // The goal notification belongs to a session that is still running; ending it clears it
    // right away instead of waiting for the response.
    onMutate: (item) => {
      if (item.mode === 'focus') void cancelFocusComplete();
      return { item };
    },
    onSuccess: (result) => {
      setSessions((current) => [result.session, ...current.filter((item) => item.id !== result.session.id)]);
      finishSessionActivity(settledActivityProps({
        mode: result.session.mode,
        serverStartedAt: result.session.server_started_at,
        plannedMinutes: result.session.planned_minutes,
        goal: { bedtime: goal.bedtime, waketime: goal.waketime },
        endedAtMs: result.session.server_ended_at
          ? Date.parse(result.session.server_ended_at)
          : Date.now(),
      }));
      setChargeNotice('');
      void queryClient.invalidateQueries({ queryKey: pointTransactionsQueryKey(userId) });
      void queryClient.invalidateQueries({ queryKey: walletQueryKey(userId) });
      const amount = result.transaction?.amount ?? 0;
      if (result.session.status === 'invalid') {
        showFeedback(result.session.invalid_reason === 'clock_skew'
          ? '기기 시간이 맞지 않아 포인트를 적립하지 못했습니다.'
          : result.session.mode === 'sleep'
            ? '수면 기록은 40분부터 유효해요. 짧은 낮잠은 기록에만 남습니다.'
            : '20분 미만의 집중 시간은 유효하지 않은 기록으로 저장됩니다.', 'danger');
        return;
      }
      const truncated = result.truncated ? ' 12시간을 넘어 12시간까지만 기록했어요.' : '';
      const growth = result.growth?.referral?.completed
        ? ` 친구 초대 보상 ${result.growth.referral.invitee_points ?? 0}P도 함께 들어왔어요.`
        : (result.growth?.challenge?.completed ?? 0) > 0
          ? ' 챌린지를 달성해 쿠폰을 받았어요. 혜택 탭에서 확인해 주세요.'
          : '';
      showFeedback((result.session.mode === 'sleep' ? '수면 기록을 정산했어요. ' : '')
        + (amount > 0
          ? `${amount}P 적립 예정이에요. 기록 탭에서 광고 1편을 보면 같은 금액을 한 번 더 받을 수 있어요.`
          : result.transaction?.note === 'weekly_cap_reached'
            ? `이번 주 기본 적립 ${pointRules.weekly.base_points}P를 모두 채웠어요. 기록은 그대로 남고, 다음 주에 다시 적립돼요.`
            : result.transaction?.note === 'daily_cap_reached'
              ? '오늘 적립할 수 있는 시간을 모두 채웠어요.'
              : `기록을 저장했어요. 적립은 ${pointRules.earn.floor_minutes}분 단위로 계산해 30분부터 1P씩 쌓입니다.`)
        + truncated + growth);
    },
    onError: (_error, item) => {
      // Ending failed: the focus session is still open, so its goal reminder goes back.
      if (item.mode === 'focus' && item.planned_minutes) {
        void scheduleFocusComplete({
          plannedMinutes: item.planned_minutes,
          startedAt: item.server_started_at,
          sessionId: item.id,
        });
      }
      showFeedback('기록을 종료하지 못했습니다. 다시 시도해 주세요.', 'danger');
    },
  });

  const saveGoal = useMutation({
    mutationFn: (next: SleepGoal) => saveSleepGoal(userId!, next.bedtime, next.waketime),
    onSuccess: (updated) => {
      queryClient.setQueryData(['profile', userId], updated);
      setGoalDraft(null);
      showFeedback('수면 목표 시간을 저장했어요.');
    },
    onError: () => showFeedback('목표 시간을 저장하지 못했습니다. 다시 시도해 주세요.', 'danger'),
  });

  const elapsedSeconds = active
    ? Math.floor(Math.max(0, nowMs - Date.parse(active.server_started_at)) / 1000)
    : 0;
  const goalDuration = goalMinutes(goal.bedtime, goal.waketime);
  const goalDirty = savedGoal.bedtime !== goal.bedtime || savedGoal.waketime !== goal.waketime;
  const syncing = start.isPending;
  const busy = syncing || end.isPending;
  const focusProgress = active?.mode === 'focus' && active.planned_minutes
    ? Math.min(100, (elapsedSeconds / (active.planned_minutes * 60)) * 100)
    : null;
  const dateLabel = new Date().toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'long',
  });

  const heroTitle = active
    ? (active.mode === 'sleep' ? '편히 주무세요' : '폰을 내려놓고 집중 중')
    : isNight
      ? '잘 준비가 되면 한 번만 눌러 주세요'
      : '오늘의 집중을 시작해 볼까요';
  const bigTime = active
    ? formatElapsed(elapsedSeconds)
    : isNight ? formatGoalMinutes(goalDuration) : formatElapsed(selectedMinutes * 60);
  const bigUnit = active ? '경과 시간' : isNight ? '수면 목표' : '목표 시간';
  const heroCaption = active
    ? (active.mode === 'sleep'
      ? '아침에 일어나면 한 번만 누르면 정산돼요 · 서버 시각 기준'
      : `목표 ${active.planned_minutes ?? selectedMinutes}분 · 20분부터 유효한 기록`)
    : isNight
      ? `취침 ${goal.bedtime} · 기상 ${goal.waketime}`
      : `30분이면 1P · ${pointRules.earn.floor_minutes}분 단위로 계산해요`;
  const actionLabel = active
    ? (active.mode === 'sleep' ? '일어났어요 · 정산하기' : '집중 끝내기')
    : isNight ? '수면 시작' : '집중 시작하기';
  const buttonLabel = syncing ? '기록을 시작하는 중…' : actionLabel;

  return <Screen>
    <View style={styles.header}>
      <View style={styles.headerText}>
        <Text style={styles.eyebrow}>오프라인 타임</Text>
        <Text style={styles.title}>오늘의 오프라인</Text>
        <Text style={styles.date}>{dateLabel}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="설정"
        onPress={() => router.push('/settings')}
        style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
        <Ionicons name="settings-outline" size={20} color={tokens.color.muted} />
      </Pressable>
    </View>

    <Card style={styles.weekCard}>
      <View style={styles.weekHead}>
        <View style={styles.flex}>
          <Text style={styles.weekLabel}>이번 주 적립</Text>
          <Text style={styles.weekValue}>
            {points.isPending ? '—' : allowance.totalEarned}
            <Text style={styles.weekUnit}>P</Text>
            <Text style={styles.weekCap}>  /  {allowance.totalCap}P</Text>
          </Text>
        </View>
        <View style={styles.weekIcon}>
          <Ionicons name="sparkles" size={18} color={tokens.color.accent} />
        </View>
      </View>
      <View style={styles.weekBars}>
        <LabeledBar label="기본 적립" value={allowance.baseEarned} cap={pointRules.weekly.base_points}
          color={tokens.color.accent} />
        <LabeledBar label="광고 부스터" value={allowance.bonusEarned} cap={pointRules.weekly.booster_points}
          color={tokens.color.indigo} />
      </View>
    </Card>

    {!active ? <View style={styles.segment}>
      {modes.map(({ mode, icon, iconOutline, label }) => {
        const selected = chosen === mode;
        return <Pressable key={mode} accessibilityRole="radio" accessibilityState={{ selected }}
          onPress={() => setModeChoice(mode)}
          style={[styles.segmentItem, selected && styles.segmentItemActive]}>
          <Ionicons name={selected ? icon : iconOutline} size={16}
            color={selected ? (mode === 'sleep' ? tokens.color.indigo : tokens.color.accentStrong) : tokens.color.muted} />
          <Text style={[styles.segmentText, selected && styles.segmentTextActive]}>{label}</Text>
        </Pressable>;
      })}
    </View> : null}

    {!active && isNight && chargingOffer ? <Pressable accessibilityRole="button"
      accessibilityLabel={`${chargingOffer.title} · ${chargingOffer.action}`}
      accessibilityHint={chargingOffer.body}
      onPress={() => { setFeedback(''); setModeChoice('sleep'); start.mutate('sleep'); }}
      style={({ pressed }) => [styles.chargeOffer, pressed && styles.pressed]}>
      <View style={styles.chargeOfferIcon}>
        <Ionicons name="battery-charging" size={20} color={tokens.color.night} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.chargeOfferTitle}>{chargingOffer.title}</Text>
        <Text style={styles.chargeOfferBody}>{chargingOffer.body}</Text>
      </View>
      <View style={styles.chargeOfferAction}>
        <Text style={styles.chargeOfferActionText}>{chargingOffer.action}</Text>
        <Ionicons name="chevron-forward" size={13} color={tokens.color.night} />
      </View>
    </Pressable> : null}

    <View style={[styles.hero, isNight ? styles.heroNight : styles.heroDay]}>
      <View style={styles.heroTop}>
        <View style={[styles.modePill, isNight ? styles.modePillNight : styles.modePillDay]}>
          <Ionicons name={isNight ? 'moon' : 'flash'} size={12}
            color={isNight ? tokens.color.moon : tokens.color.accent} />
          <Text style={[styles.modePillText, isNight ? styles.modePillTextNight : styles.modePillTextDay]}>
            {active ? (isNight ? '수면 중' : '집중 중') : isNight ? '수면 준비' : '대기 중'}
          </Text>
        </View>
        {syncing ? <View style={[styles.syncPill, isNight ? styles.syncPillNight : styles.syncPillDay]}>
          <ActivityIndicator size="small" color={isNight ? tokens.color.moon : tokens.color.accent} />
          <Text style={[styles.syncText, isNight ? styles.nightMuted : styles.syncTextDay]}>서버와 동기화 중…</Text>
        </View> : null}
      </View>

      <Text style={[styles.heroTitle, isNight && styles.nightInk]}>{heroTitle}</Text>

      <View style={styles.timerBlock}>
        <Text style={[styles.timer, isNight ? styles.timerNight : styles.timerDay]}>{bigTime}</Text>
        <Text style={[styles.timerUnit, isNight ? styles.nightMuted : styles.timerUnitDay]}>{bigUnit}</Text>
      </View>

      {active?.mode === 'focus' && focusProgress !== null ? <View style={styles.heroProgress}>
        <ProgressBar value={Math.min(100, focusProgress)} cap={100} height={6}
          color={tokens.color.accent} trackColor={tokens.color.surfaceSunken} />
      </View> : null}

      <Text style={[styles.heroCaption, isNight ? styles.nightMuted : styles.heroCaptionDay]}>{heroCaption}</Text>

      {active?.mode === 'sleep' ? <View style={styles.chargeRow}>
        <Ionicons name={chargeIcon(chargeState)} size={15} color={isNight ? tokens.color.moon : tokens.color.muted} />
        <Text style={[styles.chargeText, isNight ? styles.nightMuted : undefined]}>{sleepChargeNote(chargeState, true)}</Text>
      </View> : null}
      {active?.mode === 'sleep' && chargeNotice ? <Notice tone="moon" night>{chargeNotice}</Notice> : null}
      {active && liveActivityOn ? <View style={styles.chargeRow}>
        <Ionicons name="phone-portrait-outline" size={15} color={isNight ? tokens.color.moon : tokens.color.muted} />
        <Text style={[styles.chargeText, isNight ? styles.nightMuted : undefined]}>
          잠금화면과 다이내믹 아일랜드에서도 같은 시간이 보여요
        </Text>
      </View> : null}
      {!active && isNight ? <View style={styles.chargeRow}>
        <Ionicons name={chargeIcon(chargeState)} size={15} color={tokens.color.moon} />
        <Text style={[styles.chargeText, styles.nightMuted]}>{sleepChargeNote(chargeState, false)}</Text>
      </View> : null}
    </View>

    {!active && !isNight ? <View style={styles.presetBlock}>
      <Text style={styles.groupLabel}>집중 시간</Text>
      <View style={styles.presetRow}>
        {plans.map((minutes) => <Chip key={minutes} label={`${minutes}분`} size="lg"
          selected={selectedMinutes === minutes} onPress={() => selectMinutes(minutes)} />)}
      </View>
      <Text style={styles.hint}>20분 미만은 기록에 남지만 유효 시간으로 계산되지 않아요.</Text>
    </View> : null}

    {!active && isNight ? <Card tone="nightSoft" style={styles.nightCard}>
      <View style={styles.nightCardHead}>
        <View style={styles.flex}>
          <Text style={[styles.nightCardTitle, styles.nightInk]}>수면 목표</Text>
          <Text style={styles.nightMuted}>자기 전에 한 번, 아침에 한 번이면 정산이 끝나요.</Text>
        </View>
        <Pill label={formatGoalMinutes(goalDuration)} tone="moon" />
      </View>

      <Text style={[styles.groupLabel, styles.nightMuted]}>취침</Text>
      <View style={styles.clockRow}>
        {BEDTIME_CHOICES.map((clock) => <Chip key={clock} label={clock} night
          selected={goal.bedtime === clock} onPress={() => setGoalDraft({ ...goal, bedtime: clock })} />)}
      </View>
      <Text style={[styles.groupLabel, styles.nightMuted]}>기상</Text>
      <View style={styles.clockRow}>
        {WAKETIME_CHOICES.map((clock) => <Chip key={clock} label={clock} night
          selected={goal.waketime === clock} onPress={() => setGoalDraft({ ...goal, waketime: clock })} />)}
      </View>
      {goalDirty ? <ActionButton label="목표 시간 저장" variant="secondary" disabled={saveGoal.isPending}
        loading={saveGoal.isPending} onPress={() => { setFeedback(''); saveGoal.mutate(goal); }} /> : null}

      <View style={[styles.divider, styles.dividerNight]} />

      <Text style={[styles.nightCardTitle, styles.nightInk]}>매일 알림</Text>
      <View style={styles.switchRow}>
        <View style={styles.flex}>
          <Text style={[styles.switchLabel, styles.nightInk]}>취침 알림</Text>
          <Text style={styles.nightMuted}>매일 {goal.bedtime}에 알려드려요</Text>
        </View>
        <Switch accessibilityLabel="취침 알림" value={reminders.prefs.bedtime}
          disabled={reminders.busy} onValueChange={() => { void reminders.toggle('bedtime'); }}
          trackColor={{ false: tokens.color.nightElevated, true: tokens.color.moon }}
          thumbColor={tokens.color.nightInk} />
      </View>
      <View style={styles.switchRow}>
        <View style={styles.flex}>
          <Text style={[styles.switchLabel, styles.nightInk]}>기상 알림</Text>
          <Text style={styles.nightMuted}>매일 {goal.waketime}에 알려드려요</Text>
        </View>
        <Switch accessibilityLabel="기상 알림" value={reminders.prefs.waketime}
          disabled={reminders.busy} onValueChange={() => { void reminders.toggle('waketime'); }}
          trackColor={{ false: tokens.color.nightElevated, true: tokens.color.moon }}
          thumbColor={tokens.color.nightInk} />
      </View>
      {reminders.notice ? <Notice tone="moon" night>{reminders.notice}</Notice> : null}
      <Text style={[styles.hint, styles.nightSubtle]}>목표 시간은 안내용이고, 적립은 실제 기록 시간으로 계산해요.
        수면은 40분부터 유효하고 하루 10시간까지 적립돼요.</Text>
    </Card> : null}

    {sessions.isPending ? <View style={styles.loadingRow}>
      <ActivityIndicator color={tokens.color.accent} />
      <Text style={styles.hint}>기록을 불러오는 중이에요</Text>
    </View> : null}
    {sessions.isError ? <ActionButton label="기록 다시 불러오기" variant="secondary"
      onPress={() => { void sessions.refetch(); }} /> : null}

    <ActionButton
      label={buttonLabel}
      size="lg"
      variant={isNight ? 'night' : 'primary'}
      loading={busy}
      disabled={sessions.isPending || sessions.isError}
      icon={<Ionicons
        name={active ? 'stop-circle-outline' : isNight ? 'moon' : 'flash'}
        size={19}
        color={isNight ? tokens.color.night : tokens.color.onAccent} />}
      onPress={() => {
        setFeedback('');
        if (active) end.mutate(active);
        else start.mutate(chosen);
      }} />

    {feedback ? <Notice tone={feedbackTone}>{feedback}</Notice> : null}

    <SectionHeader title="적립 안내" caption="기록이 끝나면 포인트가 쌓여요" />
    <Card>
      <View style={styles.infoRow}>
        <View style={styles.infoIcon}><Ionicons name="time-outline" size={17} color={tokens.color.accent} /></View>
        <View style={styles.flex}>
          <Text style={styles.infoTitle}>기본 적립</Text>
          <Text style={styles.infoBody}>수면·집중 모두 1시간 = {pointRules.earn.focus_per_hour}P,
            {' '}{pointRules.earn.floor_minutes}분 단위로 계산해 30분이면 1P예요.</Text>
        </View>
      </View>
      <View style={styles.infoRow}>
        <View style={[styles.infoIcon, styles.infoIconIndigo]}>
          <Ionicons name="play-outline" size={17} color={tokens.color.indigo} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.infoTitle}>광고 부스터</Text>
          <Text style={styles.infoBody}>기록을 마친 뒤 광고 1편을 보면 적립이
            {' '}{pointRules.ads.booster_multiplier}배가 돼요. 하루 {pointRules.ads.daily_max}회까지예요.</Text>
        </View>
      </View>
      <View style={styles.infoRow}>
        <View style={styles.infoIcon}><Ionicons name="wallet-outline" size={17} color={tokens.color.accent} /></View>
        <View style={styles.flex}>
          <Text style={styles.infoTitle}>주간 상한</Text>
          <Text style={styles.infoBody}>한 주에 기본 {pointRules.weekly.base_points}P,
            {' '}광고 부스터 {pointRules.weekly.booster_points}P까지 받을 수 있어요.</Text>
        </View>
      </View>
    </Card>

    <Text style={styles.footerHint}>선택한 주력 시간: {labels[primary]} · 밤 시간에는 수면을 먼저 보여 드려요</Text>
  </Screen>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: tokens.space.sm },
  headerText: { flex: 1, gap: 2 },
  eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 1.2, color: tokens.color.accent },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5, color: tokens.color.ink },
  date: { fontSize: 13, color: tokens.color.muted, fontWeight: '500' },
  iconButton: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: tokens.color.surface, borderWidth: 1, borderColor: tokens.color.line,
    ...tokens.shadow.soft,
  },
  pressed: { opacity: 0.7 },
  flex: { flex: 1 },

  weekCard: { gap: tokens.space.sm },
  weekHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.space.sm },
  weekLabel: { fontSize: 13, fontWeight: '600', color: tokens.color.muted },
  weekValue: { fontSize: 30, fontWeight: '800', letterSpacing: -0.6, color: tokens.color.ink, ...tokens.numeric },
  weekUnit: { fontSize: 18, fontWeight: '800', color: tokens.color.inkSecondary },
  weekCap: { fontSize: 14, fontWeight: '600', color: tokens.color.subtle },
  weekIcon: {
    width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
    backgroundColor: tokens.color.accentSoft,
  },
  weekBars: { gap: tokens.space.xs },

  segment: {
    flexDirection: 'row', gap: 4, padding: 4, borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.surfaceMuted,
  },
  segmentItem: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    minHeight: 44, borderRadius: tokens.radius.pill,
  },
  segmentItemActive: { backgroundColor: tokens.color.surface, ...tokens.shadow.soft },
  segmentText: { fontSize: 15, fontWeight: '700', color: tokens.color.muted },
  segmentTextActive: { color: tokens.color.ink },

  chargeOffer: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.space.sm,
    backgroundColor: tokens.color.nightRaised, borderColor: tokens.color.moonLine, borderWidth: 1,
    borderRadius: tokens.radius.lg, paddingHorizontal: tokens.space.md, paddingVertical: tokens.space.sm,
    ...tokens.shadow.lift,
  },
  chargeOfferIcon: {
    width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
    backgroundColor: tokens.color.moon,
  },
  chargeOfferTitle: { fontSize: 15, fontWeight: '800', letterSpacing: -0.2, color: tokens.color.nightInk },
  chargeOfferBody: { fontSize: 12.5, lineHeight: 18, color: tokens.color.nightMuted, marginTop: 2 },
  chargeOfferAction: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: tokens.color.moon, borderRadius: tokens.radius.pill,
    paddingLeft: 10, paddingRight: 6, paddingVertical: 6,
  },
  chargeOfferActionText: { fontSize: 12, fontWeight: '800', color: tokens.color.night },

  hero: { borderRadius: tokens.radius.xl, borderWidth: 1, padding: tokens.space.lg, gap: tokens.space.sm },
  heroDay: { backgroundColor: tokens.color.surface, borderColor: tokens.color.line, ...tokens.shadow.card },
  heroNight: { backgroundColor: tokens.color.night, borderColor: tokens.color.nightLine, ...tokens.shadow.lift },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.space.xs, minHeight: 26 },
  modePill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: tokens.radius.pill,
    paddingHorizontal: 10, paddingVertical: 5 },
  modePillDay: { backgroundColor: tokens.color.accentSoft },
  modePillNight: { backgroundColor: tokens.color.moonSoft },
  modePillText: { fontSize: 12, fontWeight: '700' },
  modePillTextDay: { color: tokens.color.accentStrong },
  modePillTextNight: { color: tokens.color.moon },
  syncPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: tokens.radius.pill,
    paddingHorizontal: 10, paddingVertical: 4 },
  syncPillDay: { backgroundColor: tokens.color.surfaceMuted },
  syncPillNight: { backgroundColor: tokens.color.moonSoft },
  syncText: { fontSize: 11.5, fontWeight: '600' },
  syncTextDay: { color: tokens.color.muted },
  heroTitle: { fontSize: 20, lineHeight: 28, fontWeight: '700', letterSpacing: -0.3, color: tokens.color.inkSecondary },
  timerBlock: { paddingVertical: tokens.space.xs, gap: 2 },
  timer: { fontSize: 54, fontWeight: '800', letterSpacing: -2, ...tokens.numeric },
  timerDay: { color: tokens.color.ink },
  timerNight: { color: tokens.color.nightInk },
  timerUnit: { fontSize: 13, fontWeight: '600' },
  timerUnitDay: { color: tokens.color.muted },
  heroProgress: { marginTop: 2 },
  heroCaption: { fontSize: 13.5, lineHeight: 20 },
  heroCaptionDay: { color: tokens.color.muted },
  chargeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 2 },
  chargeText: { flex: 1, fontSize: 12.5, lineHeight: 19, color: tokens.color.muted },
  nightInk: { color: tokens.color.nightInk },
  nightMuted: { color: tokens.color.nightMuted, fontSize: 12.5, lineHeight: 19 },
  nightSubtle: { color: tokens.color.nightSubtle, fontSize: 12, lineHeight: 18 },

  presetBlock: { gap: tokens.space.xs },
  groupLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4, color: tokens.color.muted },
  presetRow: { flexDirection: 'row', gap: tokens.space.xs },
  hint: { fontSize: 12.5, lineHeight: 19, color: tokens.color.muted },

  nightCard: { gap: tokens.space.sm },
  nightCardHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: tokens.space.sm },
  nightCardTitle: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  clockRow: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space.xs },
  divider: { height: 1, backgroundColor: tokens.color.line, marginVertical: 2 },
  dividerNight: { backgroundColor: tokens.color.nightLine },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.space.sm, paddingVertical: 2 },
  switchLabel: { fontSize: 15, fontWeight: '700' },

  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.space.xs, justifyContent: 'center' },

  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: tokens.space.sm },
  infoIcon: {
    width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: tokens.color.accentSoft,
  },
  infoIconIndigo: { backgroundColor: tokens.color.indigoSoft },
  infoTitle: { fontSize: 14.5, fontWeight: '700', color: tokens.color.ink },
  infoBody: { fontSize: 13, lineHeight: 20, color: tokens.color.muted, marginTop: 1 },
  footerHint: { fontSize: 12, lineHeight: 18, color: tokens.color.subtle, textAlign: 'center', marginTop: tokens.space.xs },
});
