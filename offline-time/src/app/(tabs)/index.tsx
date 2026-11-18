import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/features/auth/AuthProvider';
import { saveSleepGoal, useProfile } from '@/features/auth/useProfile';
import { pointTransactionsQueryKey } from '@/features/points/pointApi';
import { DEFAULT_POINT_RULES, getPointRules, pointRulesQueryKey } from '@/features/points/pointRulesApi';
import { useFocusTimerStore } from '@/features/session/focusTimerStore';
import { endSession, listSessions, sessionQueryKey, startSession,
  type FocusMinutes, type TimeSession } from '@/features/session/sessionApi';
import { chargeFlag, chargeLabel, useChargeState } from '@/features/sleep/chargeState';
import { BEDTIME_CHOICES, WAKETIME_CHOICES, formatGoalMinutes,
  goalFromProfile, goalMinutes, kstMinutes, preferredMode, type SleepGoal } from '@/features/sleep/sleepGoal';
import { walletQueryKey } from '@/features/store/storeApi';
import { supabase } from '@/lib/supabase';
import { tokens } from '@/theme/tokens';

const labels = { sleep: '수면', focus: '집중', both: '수면과 집중' };
const plans: FocusMinutes[] = [30, 60, 90];

function formatElapsed(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return `${hours > 0 ? `${String(hours).padStart(2, '0')}:` : ''}${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

export default function Home() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const profile = useProfile(userId);
  const primary = profile.data?.primary_mode ?? 'both';
  const savedGoal = goalFromProfile(profile.data?.sleep_bedtime, profile.data?.sleep_waketime);
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState('');
  const [modeChoice, setModeChoice] = useState<'sleep' | 'focus' | null>(null);
  const [goalDraft, setGoalDraft] = useState<SleepGoal | null>(null);
  const goal = goalDraft ?? savedGoal;
  const chargeState = useChargeState();
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
  const active = sessions.data?.find((item) => item.status === 'open');
  // Before the user picks a mode, the clock decides: a night-time sleep user opens on sleep.
  const chosen = active?.mode ?? modeChoice ?? preferredMode(primary, kstMinutes(), savedGoal);

  useEffect(() => {
    if (!active) return;
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [active, tick]);

  const updateSession = (updated: TimeSession) => {
    queryClient.setQueryData<TimeSession[]>(sessionQueryKey(userId), (current) =>
      [updated, ...(current ?? []).filter((item) => item.id !== updated.id)]);
  };
  const start = useMutation({
    mutationFn: (mode: 'sleep' | 'focus') => startSession(
      mode === 'sleep'
        ? { mode: 'sleep', plannedMinutes: goalMinutes(goal.bedtime, goal.waketime) }
        : { mode: 'focus', plannedMinutes: selectedMinutes },
      chargeFlag(chargeState)),
    onSuccess: (created) => {
      updateSession(created);
      setModeChoice(created.mode);
      setFeedback(created.mode === 'sleep'
        ? '수면 기록을 시작했어요. 아침에 일어나면 한 번만 눌러 주세요.'
        : '집중 기록을 시작했습니다.');
    },
    onError: () => setFeedback('기록을 시작하지 못했습니다. 연결을 확인해 주세요.'),
  });
  const end = useMutation({
    mutationFn: (item: TimeSession) => endSession(item.id, chargeFlag(chargeState)),
    onSuccess: (result) => {
      updateSession(result.session);
      void queryClient.invalidateQueries({ queryKey: pointTransactionsQueryKey(userId) });
      void queryClient.invalidateQueries({ queryKey: walletQueryKey(userId) });
      const amount = result.transaction?.amount ?? 0;
      if (result.session.status === 'invalid') {
        setFeedback(result.session.invalid_reason === 'clock_skew'
          ? '기기 시간이 맞지 않아 포인트를 적립하지 못했습니다.'
          : result.session.mode === 'sleep'
            ? '수면 기록은 40분부터 유효해요. 짧은 낮잠은 기록에만 남습니다.'
            : '20분 미만의 집중 시간은 유효하지 않은 기록으로 저장됩니다.');
        return;
      }
      const truncated = result.truncated ? ' 12시간을 넘어 12시간까지만 기록했어요.' : '';
      const growth = result.growth?.referral?.completed
        ? ` 친구 초대 보상 ${result.growth.referral.invitee_points ?? 0}P도 함께 들어왔어요.`
        : (result.growth?.challenge?.completed ?? 0) > 0
          ? ' 챌린지를 달성해 쿠폰을 받았어요. 혜택 탭에서 확인해 주세요.'
          : '';
      setFeedback((result.session.mode === 'sleep' ? '수면 기록을 정산했어요. ' : '')
        + (amount > 0
          ? `${amount}P 적립 예정이에요. 기록 탭에서 광고 1편을 보면 같은 금액을 한 번 더 받을 수 있어요.`
          : result.transaction?.note === 'weekly_cap_reached'
            ? `이번 주 기본 적립 ${pointRules.weekly.base_points}P를 모두 채웠어요. 기록은 그대로 남고, 다음 주에 다시 적립돼요.`
            : result.transaction?.note === 'daily_cap_reached'
              ? '오늘 적립할 수 있는 시간을 모두 채웠어요.'
              : `기록을 저장했어요. 적립은 ${pointRules.earn.floor_minutes}분 단위로 계산해 30분부터 1P씩 쌓입니다.`)
        + truncated + growth);
    },
    onError: () => setFeedback('기록을 종료하지 못했습니다. 다시 시도해 주세요.'),
  });
  const saveGoal = useMutation({
    mutationFn: (next: SleepGoal) => saveSleepGoal(userId!, next.bedtime, next.waketime),
    onSuccess: (updated) => {
      queryClient.setQueryData(['profile', userId], updated);
      setGoalDraft(null);
      setFeedback('수면 목표 시간을 저장했어요.');
    },
    onError: () => setFeedback('목표 시간을 저장하지 못했습니다. 다시 시도해 주세요.'),
  });

  const elapsedSeconds = active
    ? Math.floor(Math.max(0, nowMs - Date.parse(active.server_started_at)) / 1000)
    : 0;
  const busy = start.isPending || end.isPending;
  const goalDuration = goalMinutes(goal.bedtime, goal.waketime);
  const goalDirty = savedGoal.bedtime !== goal.bedtime || savedGoal.waketime !== goal.waketime;

  return <Screen>
    <Text style={styles.eyebrow}>오프라인 타임</Text>
    <Text style={styles.title}>오늘의 오프라인</Text>
    <View style={styles.card}>
      <Text style={styles.status}>{active
        ? (active.mode === 'sleep' ? '수면 중' : '집중 중')
        : chosen === 'sleep' ? '수면 준비' : '대기 중'}</Text>
      <Text style={styles.cardTitle}>{active
        ? (active.mode === 'sleep' ? '편히 주무세요' : '폰을 내려놓고 집중해 보세요')
        : chosen === 'sleep'
          ? '충전기를 꽂고 잘 준비가 되면 한 번만 눌러 주세요'
          : `${labels[primary]} 시간을 기록할 준비가 됐어요`}</Text>
      {active ? <>
        <Text style={styles.timer}>{formatElapsed(elapsedSeconds)}</Text>
        <Text style={styles.description}>{active.mode === 'sleep'
          ? '아침에 일어나면 아래 버튼을 한 번 눌러 주세요. 서버 시각으로 정산돼요.'
          : `선택한 목표 ${active.planned_minutes ?? 30}분 · 20분부터 유효한 기록`}</Text>
        <Text style={styles.description}>{chargeLabel(chargeState)}</Text>
      </> : <Text style={styles.description}>{chosen === 'sleep'
        ? '한 번 누르면 아침까지 쌓이고, 아침에 한 번 누르면 정산이 끝나요.'
        : '집중 시간을 시작하면 이곳에서 경과 시간을 볼 수 있어요.'}</Text>}
    </View>
    {!active ? <View style={styles.modeRow}>
      <Pressable accessibilityRole="radio" accessibilityState={{ selected: chosen === 'sleep' }}
        onPress={() => setModeChoice('sleep')}
        style={[styles.modeButton, chosen === 'sleep' && styles.modeButtonSelected]}>
        <Text style={[styles.modeText, chosen === 'sleep' && styles.modeTextSelected]}>수면</Text>
      </Pressable>
      <Pressable accessibilityRole="radio" accessibilityState={{ selected: chosen === 'focus' }}
        onPress={() => setModeChoice('focus')}
        style={[styles.modeButton, chosen === 'focus' && styles.modeButtonSelected]}>
        <Text style={[styles.modeText, chosen === 'focus' && styles.modeTextSelected]}>집중</Text>
      </Pressable>
    </View> : null}
    {!active && chosen === 'sleep' ? <View style={styles.planSection}>
      <Text style={styles.sectionTitle}>수면 목표</Text>
      <Text style={styles.description}>취침 {goal.bedtime} · 기상 {goal.waketime} · {formatGoalMinutes
        (goalDuration)}</Text>
      <Text style={styles.hint}>{chargeLabel(chargeState)}</Text>
      <Text style={styles.hint}>취침 목표</Text>
      <View style={styles.plans}>{BEDTIME_CHOICES.map((clock) => <Pressable key={clock}
        accessibilityRole="radio" accessibilityState={{ selected: goal.bedtime === clock }}
        onPress={() => setGoalDraft({ ...goal, bedtime: clock })}
        style={[styles.chip, goal.bedtime === clock && styles.selectedPlan]}>
        <Text style={[styles.chipText, goal.bedtime === clock && styles.selectedPlanText]}>{clock}</Text>
      </Pressable>)}</View>
      <Text style={styles.hint}>기상 목표</Text>
      <View style={styles.plans}>{WAKETIME_CHOICES.map((clock) => <Pressable key={clock}
        accessibilityRole="radio" accessibilityState={{ selected: goal.waketime === clock }}
        onPress={() => setGoalDraft({ ...goal, waketime: clock })}
        style={[styles.chip, goal.waketime === clock && styles.selectedPlan]}>
        <Text style={[styles.chipText, goal.waketime === clock && styles.selectedPlanText]}>{clock}</Text>
      </Pressable>)}</View>
      {goalDirty ? <ActionButton label="목표 시간 저장" secondary disabled={saveGoal.isPending}
        onPress={() => saveGoal.mutate(goal)} /> : null}
      <Text style={styles.hint}>목표 시간은 안내용이고, 적립은 실제 기록 시간으로 계산해요.
        수면은 40분부터 유효하고 하루 10시간까지 적립돼요.</Text>
    </View> : null}
    {!active && chosen === 'focus' ? <View style={styles.planSection}>
      <Text style={styles.sectionTitle}>집중 시간 목표</Text>
      <View style={styles.plans}>{plans.map((minutes) => <Pressable key={minutes}
        accessibilityRole="radio" accessibilityState={{ selected: selectedMinutes === minutes }}
        onPress={() => selectMinutes(minutes)}
        style={[styles.plan, selectedMinutes === minutes && styles.selectedPlan]}>
        <Text style={[styles.planText, selectedMinutes === minutes && styles.selectedPlanText]}>{minutes}분</Text>
      </Pressable>)}</View>
      <Text style={styles.hint}>20분 미만은 기록에 남지만 유효 시간으로 계산되지 않아요.</Text>
    </View> : null}
    {sessions.isPending ? <ActivityIndicator color={tokens.color.accent} /> : null}
    {sessions.isError ? <ActionButton label="기록 다시 불러오기" secondary onPress={() => { void sessions.refetch(); }} /> : null}
    {!sessions.isPending && !sessions.isError ? <ActionButton
      label={active
        ? (active.mode === 'sleep' ? '일어났어요 · 정산하기' : '집중 끝내기')
        : (chosen === 'sleep' ? '수면 시작' : '집중 시작하기')}
      disabled={busy}
      onPress={() => {
        setFeedback('');
        if (active) end.mutate(active);
        else start.mutate(chosen);
      }} /> : null}
    {feedback ? <Text accessibilityRole="alert" style={styles.feedback}>{feedback}</Text> : null}
    <View style={styles.infoCard}>
      <Text style={styles.sectionTitle}>적립 기준</Text>
      <Text style={styles.description}>기본 적립은 수면·집중 모두 1시간 = {pointRules.earn.focus_per_hour}P,
        {' '}{pointRules.earn.floor_minutes}분 단위로 계산해요. 30분이면 1P가 쌓여요.</Text>
      <Text style={styles.description}>기록을 마친 뒤 광고 1편을 보면 그 기록의 적립이 {pointRules.ads.booster_multiplier}배가 돼요. 하루 {pointRules.ads.daily_max}회까지 받을 수 있어요.</Text>
      <Text style={styles.description}>한 주에는 기본 {pointRules.weekly.base_points}P, 광고 부스터 {pointRules.weekly.booster_points}P까지 받을 수 있어요.</Text>
    </View>
    <Text style={styles.hint}>선택한 주력 시간: {labels[primary]} · 밤 시간에는 수면을 먼저 보여 드려요</Text>
    <View style={styles.spacer} />
    <ActionButton label="로그아웃" secondary onPress={() => { void supabase?.auth.signOut(); }} />
  </Screen>;
}

const styles = StyleSheet.create({
  eyebrow: { color: tokens.color.accent, fontWeight: '700', marginTop: 20 },
  title: { fontSize: 30, fontWeight: '800', color: tokens.color.ink },
  card: { backgroundColor: tokens.color.surface, borderRadius: tokens.radius.lg, padding: 24, minHeight: 220,
    justifyContent: 'center', gap: 12, marginTop: 12 },
  infoCard: { backgroundColor: tokens.color.surface, borderRadius: tokens.radius.lg, padding: 24, gap: 8 },
  status: { color: tokens.color.accent, fontWeight: '700', fontSize: 14 },
  cardTitle: { color: tokens.color.ink, fontSize: 23, lineHeight: 32, fontWeight: '800' },
  timer: { color: tokens.color.accent, fontSize: 44, fontWeight: '800', fontVariant: ['tabular-nums'] },
  description: { color: tokens.color.muted, fontSize: 15, lineHeight: 23 },
  modeRow: { flexDirection: 'row', gap: 10 },
  modeButton: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center',
    borderRadius: tokens.radius.md, borderWidth: 1, borderColor: tokens.color.line,
    backgroundColor: tokens.color.surface },
  modeButtonSelected: { borderColor: tokens.color.accent, backgroundColor: tokens.color.accentSoft },
  modeText: { color: tokens.color.ink, fontWeight: '700' },
  modeTextSelected: { color: tokens.color.accent },
  planSection: { gap: 12 },
  sectionTitle: { color: tokens.color.ink, fontSize: 17, fontWeight: '700' },
  plans: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  plan: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: tokens.radius.md,
    borderWidth: 1, borderColor: tokens.color.line, backgroundColor: tokens.color.surface },
  chip: { minHeight: 44, minWidth: 68, paddingHorizontal: 14, alignItems: 'center',
    justifyContent: 'center', borderRadius: tokens.radius.md, borderWidth: 1,
    borderColor: tokens.color.line, backgroundColor: tokens.color.surface },
  selectedPlan: { borderColor: tokens.color.accent, backgroundColor: tokens.color.accentSoft },
  planText: { color: tokens.color.ink, fontWeight: '700' },
  chipText: { color: tokens.color.ink, fontWeight: '700' },
  selectedPlanText: { color: tokens.color.accent },
  hint: { color: tokens.color.muted, fontSize: 14 },
  feedback: { color: tokens.color.accent, fontSize: 14, lineHeight: 21 },
  spacer: { flex: 1 },
});
