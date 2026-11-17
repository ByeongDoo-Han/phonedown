import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { Screen } from '@/components/Screen';
import { showRewardedAd } from '@/features/ads/rewardedAd';
import { useAuth } from '@/features/auth/AuthProvider';
import { adRewardClaimsQueryKey, listAdRewardClaims,
  type AdRewardClaim } from '@/features/points/adRewardsApi';
import { listPointTransactions, pointTransactionsQueryKey,
  type PointTransaction } from '@/features/points/pointApi';
import { DEFAULT_POINT_RULES, getPointRules, pointRulesQueryKey } from '@/features/points/pointRulesApi';
import { boosterState, kstDayString, weeklyBoxState, type BoosterState } from '@/features/points/rewardMath';
import { listSettlements, settlementsQueryKey } from '@/features/points/settlementApi';
import { listSessions, sessionQueryKey, type TimeSession } from '@/features/session/sessionApi';
import { walletQueryKey } from '@/features/store/storeApi';
import { tokens } from '@/theme/tokens';

function formatDate(value: string) {
  return new Date(value).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function formatDuration(session: TimeSession) {
  if (!session.server_ended_at) return '진행 중';
  const minutes = Math.floor((Date.parse(session.server_ended_at) - Date.parse(session.server_started_at)) / 60_000);
  if (minutes < 60) return `${Math.max(0, minutes)}분`;
  return `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;
}

function statusText(session: TimeSession) {
  if (session.status === 'open') return '진행 중';
  if (session.status === 'valid') return '기록 완료';
  if (session.invalid_reason === 'too_short') return '20분 미만';
  if (session.invalid_reason === 'clock_skew') return '기기 시간 확인 필요';
  return '유효하지 않은 기록';
}

function basePointText(transaction: PointTransaction | undefined) {
  if (!transaction) return null;
  if (transaction.note === 'daily_cap_reached') return '오늘 적립 한도에 도달했어요';
  if (transaction.amount === 0) return '기본 적립 없음 · 1시간부터 쌓여요';
  return `기본 +${transaction.amount}P ${transaction.status === 'confirmed' ? '적립 완료' : '적립 예정'}`;
}

function RecordCard({ item, base, booster, multiplier, dailyMax, busy, onBoost }: {
  item: TimeSession;
  base: PointTransaction | undefined;
  booster: BoosterState;
  multiplier: number;
  dailyMax: number;
  busy: boolean;
  onBoost: () => void;
}) {
  return <View style={styles.card}>
    <View style={styles.row}>
      <Text style={styles.heading}>{item.mode === 'focus' ? '집중' : '수면'}</Text>
      <Text style={[styles.status, item.status === 'invalid' && styles.invalid]}>{statusText(item)}</Text>
    </View>
    <Text style={styles.duration}>{formatDuration(item)}</Text>
    <Text style={styles.body}>{formatDate(item.server_started_at)} 시작</Text>
    {basePointText(base) ? <Text style={styles.points}>{basePointText(base)}</Text> : null}
    {booster.status === 'claimed'
      ? <Text style={styles.points}>+{booster.bonusPoints}P 광고 부스터 적용</Text>
      : null}
    {booster.status === 'ready'
      ? <ActionButton label={`광고 보고 ${multiplier}배 받기 (+${booster.bonusPoints}P)`}
        disabled={busy} onPress={onBoost} />
      : null}
    {booster.status === 'limit'
      ? <Text style={styles.body}>오늘 부스터 {dailyMax}회를 모두 받았어요. 다음 기록부터 다시 받을 수 있어요.</Text>
      : null}
  </View>;
}

export default function Records() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState('');
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
  const claims = useQuery({
    queryKey: adRewardClaimsQueryKey(userId),
    enabled: !!userId,
    queryFn: () => listAdRewardClaims(userId!),
  });
  const settlements = useQuery({
    queryKey: settlementsQueryKey(userId),
    enabled: !!userId,
    queryFn: () => listSettlements(userId!),
  });
  const rules = useQuery({ queryKey: pointRulesQueryKey, queryFn: getPointRules,
    staleTime: 5 * 60_000 });
  const pointRules = rules.data ?? DEFAULT_POINT_RULES;
  const ads = pointRules.ads;

  const baseBySession = new Map<string, PointTransaction>();
  for (const transaction of points.data ?? []) {
    if (transaction.kind !== 'bonus' && transaction.session_id) {
      baseBySession.set(transaction.session_id, transaction);
    }
  }
  const grantedClaims = (claims.data ?? [])
    .filter((claim) => claim.kind === 'settlement_booster' && claim.bonus_points > 0);
  const boosterBySession = new Map<string, AdRewardClaim>();
  for (const claim of grantedClaims) {
    if (claim.session_id) boosterBySession.set(claim.session_id, claim);
  }
  const today = kstDayString();
  const boostsToday = grantedClaims.filter((claim) => claim.claim_day === today).length;
  const boxClaim = (claims.data ?? []).find((claim) => claim.kind === 'weekly_box' && claim.bonus_points > 0);
  const box = weeklyBoxState({
    enabled: ads.weekly_box,
    settledWeekId: settlements.data?.[0]?.week_id ?? null,
    claimedWeekId: boxClaim?.week_id ?? null,
    bonusPoints: ads.weekly_bonus_points,
  });

  const boost = useMutation({
    mutationFn: () => showRewardedAd(),
    onSuccess: (outcome) => {
      setNotice(outcome === 'unavailable'
        ? '지금은 광고를 불러올 수 없어요. 기본 적립은 그대로 유지됩니다.'
        : outcome === 'dismissed'
          ? '광고를 끝까지 봐야 부스터가 적용돼요.'
          : '부스터를 확인하고 있어요. 잠시 뒤 기록을 다시 불러와 주세요.');
      if (outcome === 'rewarded') {
        void queryClient.invalidateQueries({ queryKey: adRewardClaimsQueryKey(userId) });
        void queryClient.invalidateQueries({ queryKey: pointTransactionsQueryKey(userId) });
        void queryClient.invalidateQueries({ queryKey: walletQueryKey(userId) });
      }
    },
    onError: () => setNotice('광고를 불러오지 못했어요. 기본 적립은 그대로 유지됩니다.'),
  });

  return <Screen>
    <Text style={styles.title}>기록</Text>
    <Text style={styles.subtitle}>기본 1시간 = {pointRules.earn.focus_per_hour}P · 광고를 보면 {ads.booster_multiplier}배</Text>
    {sessions.isPending ? <ActivityIndicator color={tokens.color.accent} /> : null}
    {sessions.isError ? <View style={styles.card}>
      <Text style={styles.body}>기록을 불러오지 못했습니다.</Text>
      <ActionButton label="다시 불러오기" secondary onPress={() => { void sessions.refetch(); }} />
    </View> : null}
    {sessions.data?.length === 0 ? <View style={styles.card}>
      <Text style={styles.heading}>아직 기록이 없어요</Text>
      <Text style={styles.body}>홈에서 집중 시간을 시작해 보세요.</Text>
    </View> : null}
    {points.isError || claims.isError ? <Text style={styles.body}>포인트 기록을 불러오지 못했습니다.</Text> : null}
    {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}
    {box.status !== 'disabled' && box.status !== 'locked' ? <View style={styles.boxCard}>
      <Text style={styles.heading}>주간 보너스 상자</Text>
      <Text style={styles.body}>{box.status === 'claimed'
        ? `${box.weekId} 정산 상자를 열었어요. +${box.bonusPoints}P가 적립 예정이에요.`
        : `${box.weekId} 정산을 마쳤어요. 광고 1편을 보면 ${box.bonusPoints}P를 더 드려요.`}</Text>
      {box.status === 'ready' ? <ActionButton label={`광고 보고 ${box.bonusPoints}P 받기`}
        disabled={boost.isPending} onPress={() => { setNotice(''); boost.mutate(); }} /> : null}
    </View> : null}
    {sessions.data?.map((item) => {
      const base = baseBySession.get(item.id);
      const claim = boosterBySession.get(item.id);
      return <RecordCard key={item.id} item={item} base={base}
        booster={boosterState({
          basePoints: base?.amount ?? 0,
          multiplier: ads.booster_multiplier,
          claimedBonus: claim ? claim.bonus_points : null,
          claimsToday: boostsToday,
          dailyMax: ads.daily_max,
          settled: !base || base.status !== 'pending',
          enabled: ads.settlement_booster,
        })}
        multiplier={ads.booster_multiplier} dailyMax={ads.daily_max}
        busy={boost.isPending}
        onBoost={() => { setNotice(''); boost.mutate(); }} />;
    })}
  </Screen>;
}

const styles = StyleSheet.create({
  title: { fontSize: 30, fontWeight: '800', color: tokens.color.ink, marginTop: 20 },
  subtitle: { color: tokens.color.muted, fontSize: 15 },
  card: { backgroundColor: tokens.color.surface, borderRadius: tokens.radius.lg, padding: 24, gap: 12 },
  boxCard: { backgroundColor: tokens.color.accentSoft, borderRadius: tokens.radius.lg, padding: 24, gap: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heading: { fontSize: 20, fontWeight: '700', color: tokens.color.ink },
  status: { color: tokens.color.accent, fontSize: 14, fontWeight: '700' },
  invalid: { color: tokens.color.danger },
  duration: { color: tokens.color.ink, fontSize: 28, fontWeight: '800' },
  body: { fontSize: 15, lineHeight: 23, color: tokens.color.muted },
  points: { fontSize: 16, fontWeight: '700', color: tokens.color.accent },
  notice: { color: tokens.color.accent, fontSize: 14, lineHeight: 21 },
});
