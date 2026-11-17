import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/features/auth/AuthProvider';
import { useProfile } from '@/features/auth/useProfile';
import { pointTransactionsQueryKey } from '@/features/points/pointApi';
import { DEFAULT_POINT_RULES, getPointRules, pointRulesQueryKey } from '@/features/points/pointRulesApi';
import { useFocusTimerStore } from '@/features/session/focusTimerStore';
import { endFocusSession, listSessions, sessionQueryKey, startFocusSession,
  type FocusMinutes, type TimeSession } from '@/features/session/sessionApi';
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
  const mode = profile.data?.primary_mode ?? 'both';
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState('');
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
    mutationFn: () => startFocusSession(selectedMinutes),
    onSuccess: (created) => { updateSession(created); setFeedback('집중 기록을 시작했습니다.'); },
    onError: () => setFeedback('집중 기록을 시작하지 못했습니다. 연결을 확인해 주세요.'),
  });
  const end = useMutation({
    mutationFn: (sessionId: string) => endFocusSession(sessionId),
    onSuccess: (result) => {
      updateSession(result.session);
      void queryClient.invalidateQueries({ queryKey: pointTransactionsQueryKey(userId) });
      void queryClient.invalidateQueries({ queryKey: walletQueryKey(userId) });
      const amount = result.transaction?.amount ?? 0;
      setFeedback(result.session.status === 'invalid'
        ? result.session.invalid_reason === 'clock_skew'
          ? '기기 시간이 맞지 않아 포인트를 적립하지 못했습니다.'
          : '20분 미만의 집중 시간은 유효하지 않은 기록으로 저장됩니다.'
        : amount > 0
          ? `${amount}P 적립 예정이에요. 기록 탭에서 광고 1편을 보면 같은 금액을 한 번 더 받을 수 있어요.`
          : result.transaction?.note === 'weekly_cap_reached'
            ? `이번 주 기본 적립 ${pointRules.weekly.base_points}P를 모두 채웠어요. 기록은 그대로 남고, 다음 주에 다시 적립돼요.`
            : `기록을 저장했어요. 적립은 ${pointRules.earn.floor_minutes}분 단위로 계산해 30분부터 1P씩 쌓입니다.`);
    },
    onError: () => setFeedback('집중 기록을 종료하지 못했습니다. 다시 시도해 주세요.'),
  });
  const elapsedSeconds = active
    ? Math.floor(Math.max(0, nowMs - Date.parse(active.server_started_at)) / 1000)
    : 0;
  const busy = start.isPending || end.isPending;

  return <Screen>
    <Text style={styles.eyebrow}>오프라인 타임</Text>
    <Text style={styles.title}>오늘의 오프라인</Text>
    <View style={styles.card}>
      <Text style={styles.status}>{active ? '집중 중' : '대기 중'}</Text>
      <Text style={styles.cardTitle}>{active ? '폰을 내려놓고 집중해 보세요' : `${labels[mode]} 시간을 기록할 준비가 됐어요`}</Text>
      {active ? <>
        <Text style={styles.timer}>{formatElapsed(elapsedSeconds)}</Text>
        <Text style={styles.description}>선택한 목표 {active.planned_minutes ?? 30}분 · 20분부터 유효한 기록</Text>
      </> : <Text style={styles.description}>집중 시간을 시작하면 이곳에서 경과 시간을 볼 수 있어요.</Text>}
    </View>
    {!active ? <View style={styles.planSection}>
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
      label={active ? '집중 끝내기' : '집중 시작하기'}
      disabled={busy || (!!active && active.mode !== 'focus')}
      onPress={() => {
        setFeedback('');
        if (active) end.mutate(active.id);
        else start.mutate();
      }} /> : null}
    {feedback ? <Text accessibilityRole="alert" style={styles.feedback}>{feedback}</Text> : null}
    <View style={styles.infoCard}>
      <Text style={styles.sectionTitle}>적립 기준</Text>
      <Text style={styles.description}>기본 적립은 1시간 = {pointRules.earn.focus_per_hour}P, {pointRules.earn.floor_minutes}분 단위로 계산해요. 30분 집중하면 1P가 쌓여요.</Text>
      <Text style={styles.description}>기록을 마친 뒤 광고 1편을 보면 그 기록의 적립이 {pointRules.ads.booster_multiplier}배가 돼요. 하루 {pointRules.ads.daily_max}회까지 받을 수 있어요.</Text>
      <Text style={styles.description}>한 주에는 기본 {pointRules.weekly.base_points}P, 광고 부스터 {pointRules.weekly.booster_points}P까지 받을 수 있어요.</Text>
    </View>
    <Text style={styles.hint}>선택한 주력 시간: {labels[mode]}</Text>
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
  planSection: { gap: 12 },
  sectionTitle: { color: tokens.color.ink, fontSize: 17, fontWeight: '700' },
  plans: { flexDirection: 'row', gap: 10 },
  plan: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: tokens.radius.md,
    borderWidth: 1, borderColor: tokens.color.line, backgroundColor: tokens.color.surface },
  selectedPlan: { borderColor: tokens.color.accent, backgroundColor: tokens.color.accentSoft },
  planText: { color: tokens.color.ink, fontWeight: '700' },
  selectedPlanText: { color: tokens.color.accent },
  hint: { color: tokens.color.muted, fontSize: 14 },
  feedback: { color: tokens.color.accent, fontSize: 14, lineHeight: 21 },
  spacer: { flex: 1 },
});
