import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ComponentProps } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { Card, SectionHeader } from '@/components/Card';
import { LabeledBar } from '@/components/ProgressBar';
import { Notice, Pill, type PillTone } from '@/components/Pill';
import { Screen } from '@/components/Screen';
import type { RewardedPlacement } from '@/features/ads/adPlacement';
import { showRewardedAd } from '@/features/ads/rewardedAd';
import { useAuth } from '@/features/auth/AuthProvider';
import { adRewardClaimsQueryKey, listAdRewardClaims,
  type AdRewardClaim } from '@/features/points/adRewardsApi';
import { AD_REWARD_PENDING_NOTICE, AD_REWARD_WAIT_NOTICE, adRewardDeniedNotice,
  adRewardPendingKey, adRewardPendingLabel, watchAdReward } from '@/features/points/adRewardWatch';
import { listPointTransactions, pointTransactionsQueryKey,
  type PointTransaction } from '@/features/points/pointApi';
import { DEFAULT_POINT_RULES, getPointRules, pointRulesQueryKey } from '@/features/points/pointRulesApi';
import { boosterState, currentWeekId, kstDayString, weeklyAllowance, weeklyBoxState,
  type BoosterState } from '@/features/points/rewardMath';
import { listSettlements, settlementsQueryKey } from '@/features/points/settlementApi';
import { listSessions, sessionQueryKey, type TimeSession } from '@/features/session/sessionApi';
import { walletQueryKey } from '@/features/store/storeApi';
import { tokens } from '@/theme/tokens';

type IconName = ComponentProps<typeof Ionicons>['name'];

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
  if (session.invalid_reason === 'too_short') return session.mode === 'sleep' ? '40분 미만' : '20분 미만';
  if (session.invalid_reason === 'clock_skew') return '기기 시간 확인 필요';
  return '유효하지 않은 기록';
}

function statusTone(session: TimeSession): PillTone {
  if (session.status === 'valid') return 'accent';
  if (session.status === 'open') return 'warning';
  return 'danger';
}

function basePointText(transaction: PointTransaction | undefined, baseCap: number) {
  if (!transaction) return null;
  if (transaction.note === 'daily_cap_reached') return '오늘 적립 한도에 도달했어요';
  if (transaction.note === 'weekly_cap_reached') {
    return transaction.amount > 0
      ? `기본 +${transaction.amount}P · 이번 주 ${baseCap}P 한도에 도달했어요`
      : `이번 주 기본 적립 ${baseCap}P를 채웠어요 · 기록은 그대로 남아요`;
  }
  if (transaction.amount === 0) return '기본 적립 없음 · 30분부터 1P씩 쌓여요';
  return `기본 +${transaction.amount}P ${transaction.status === 'confirmed' ? '적립 완료' : '적립 예정'}`;
}

function RecordCard({ item, base, booster, multiplier, dailyMax, baseCap, busy, pending,
  onBoost }: {
  item: TimeSession;
  base: PointTransaction | undefined;
  booster: BoosterState;
  multiplier: number;
  dailyMax: number;
  baseCap: number;
  busy: boolean;
  pending: boolean;
  onBoost: () => void;
}) {
  const sleep = item.mode === 'sleep';
  const icon: IconName = sleep ? 'moon' : 'flash';
  return <Card style={styles.recordCard}>
    <View style={styles.recordHead}>
      <View style={styles.recordLeft}>
        <View style={[styles.modeIcon, sleep ? styles.modeIconNight : styles.modeIconDay]}>
          <Ionicons name={icon} size={17} color={sleep ? tokens.color.moon : tokens.color.accent} />
        </View>
        <View style={styles.recordIdentity}>
          <Text style={styles.recordMode}>{sleep ? '수면' : '집중'}</Text>
          <Text style={styles.recordDate}>{formatDate(item.server_started_at)} 시작</Text>
        </View>
      </View>
      <Pill label={statusText(item)} tone={statusTone(item)} />
    </View>

    <View style={styles.recordBody}>
      <Text style={[styles.recordDuration, item.status === 'invalid' && styles.recordDurationMuted]}>
        {formatDuration(item)}
      </Text>
      {basePointText(base, baseCap)
        ? <Text style={styles.recordPoints}>{basePointText(base, baseCap)}</Text>
        : null}
      {booster.status === 'claimed'
        ? <Text style={styles.recordBoost}>+{booster.bonusPoints}P 광고 부스터 적용</Text>
        : null}
      {sleep && item.started_charging ? <Text style={styles.recordMeta}>충전 연결 상태로 시작</Text> : null}
    </View>

    {booster.status === 'ready'
      ? <ActionButton
        label={pending
          ? adRewardPendingLabel({ kind: 'settlement_booster', sessionId: item.id })
          : `광고 보고 ${multiplier}배 받기 (+${booster.bonusPoints}P)`}
        icon={<Ionicons name="play-circle-outline" size={19} color={tokens.color.onAccent} />}
        disabled={busy || pending} onPress={onBoost} />
      : null}
    {booster.status === 'limit'
      ? <Text style={styles.recordMeta}>오늘 부스터 {dailyMax}회를 모두 받았어요. 다음 기록부터 다시 받을 수 있어요.</Text>
      : null}
  </Card>;
}

export default function Records() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState('');
  const [noticeTone, setNoticeTone] = useState<'accent' | 'danger'>('accent');
  // 광고는 봤지만 SSV 콜백이 아직 서버에 닿지 않은 대상. 이 동안 해당 버튼만 잠근다.
  const [pendingAds, setPendingAds] = useState<RewardedPlacement[]>([]);
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
  const week = currentWeekId();
  const weekBase = (points.data ?? [])
    .filter((transaction) => transaction.week_id === week && transaction.kind !== 'bonus')
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const weekBonus = (points.data ?? [])
    .filter((transaction) => transaction.week_id === week && transaction.kind === 'bonus'
      // 초대·챌린지 보너스는 광고 풀과 별개다. 80P 진행률에는 광고 보너스만 넣는다.
      && transaction.bonus_pool === 'ad')
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const allowance = weeklyAllowance({ basePoints: weekBase, bonusPoints: weekBonus,
    cap: pointRules.weekly });
  const boxClaim = (claims.data ?? []).find((claim) => claim.kind === 'weekly_box' && claim.bonus_points > 0);
  const box = weeklyBoxState({
    enabled: ads.weekly_box,
    settledWeekId: settlements.data?.[0]?.week_id ?? null,
    claimedWeekId: boxClaim?.week_id ?? null,
    bonusPoints: ads.weekly_bonus_points,
  });

  const boost = useMutation({
    mutationFn: (placement: RewardedPlacement) => showRewardedAd(placement, userId),
    onSuccess: (outcome, placement) => {
      if (outcome !== 'rewarded') {
        setNoticeTone(outcome === 'unavailable' ? 'danger' : 'accent');
        setNotice(outcome === 'unavailable'
          ? '지금은 광고를 불러올 수 없어요. 기본 적립은 그대로 유지됩니다.'
          : '광고를 끝까지 봐야 부스터가 적용돼요.');
        return;
      }
      const key = adRewardPendingKey(placement);
      setPendingAds((current) => current.some((item) => adRewardPendingKey(item) === key)
        ? current
        : [...current, placement]);
      setNoticeTone('accent');
      setNotice(AD_REWARD_PENDING_NOTICE);
      void queryClient.invalidateQueries({ queryKey: adRewardClaimsQueryKey(userId) });
      void queryClient.invalidateQueries({ queryKey: pointTransactionsQueryKey(userId) });
      void queryClient.invalidateQueries({ queryKey: walletQueryKey(userId) });
    },
    onError: () => {
      setNoticeTone('danger');
      setNotice('광고를 불러오지 못했어요. 기본 적립은 그대로 유지됩니다.');
    },
  });

  // 주간 상자는 정산을 마친 주에만 열린다. 그 주의 주장만 이번 시청과 견줄 수 있다.
  const settledWeekId = box.status === 'ready' || box.status === 'claimed' ? box.weekId : null;

  // The claim row appears only when the SSV callback lands, so re-read the ledger every two
  // seconds instead of asking the user to refresh. Each watch releases its own button, and a
  // wait that never sees a row ends with a notice rather than an endless disable. The stop
  // functions clear the timers when the screen goes away.
  useEffect(() => {
    if (pendingAds.length === 0) return;
    const stops = pendingAds.map((placement) => watchAdReward({
      placement,
      settledWeekId,
      readClaims: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: adRewardClaimsQueryKey(userId) }),
          queryClient.invalidateQueries({ queryKey: pointTransactionsQueryKey(userId) }),
          queryClient.invalidateQueries({ queryKey: walletQueryKey(userId) }),
        ]);
        return queryClient.getQueryData<AdRewardClaim[]>(adRewardClaimsQueryKey(userId)) ?? [];
      },
      onSettled: (result) => {
        const key = adRewardPendingKey(placement);
        setPendingAds((current) => current.filter((item) => adRewardPendingKey(item) !== key));
        if (result.status === 'denied') {
          setNoticeTone('danger');
          setNotice(adRewardDeniedNotice(result.reason));
        } else if (result.status === 'timeout') {
          // 테스트 광고처럼 SSV가 오지 않아도 버튼을 풀고 안내한다.
          setNoticeTone('accent');
          setNotice(AD_REWARD_WAIT_NOTICE);
        } else {
          setNotice((current) => (current === AD_REWARD_PENDING_NOTICE ? '' : current));
        }
      },
    }));
    return () => {
      for (const stop of stops) stop();
    };
  }, [pendingAds, queryClient, settledWeekId, userId]);

  const boxPending = pendingAds.some((placement) => placement.kind === 'weekly_box');
  const settledBase = allowance.baseRemaining === 0;

  return <Screen>
    <View style={styles.header}>
      <Text style={styles.eyebrow}>기록</Text>
      <Text style={styles.title}>이번 주 적립과 지난 기록</Text>
      <Text style={styles.subtitle}>수면·집중 기본 1시간 = {pointRules.earn.focus_per_hour}P ·
        {' '}30분 = 1P · 광고를 보면 {ads.booster_multiplier}배</Text>
    </View>

    <Card style={styles.gaugeCard}>
      <View style={styles.gaugeHead}>
        <View style={styles.flex}>
          <Text style={styles.gaugeLabel}>이번 주 적립</Text>
          <Text style={styles.gaugeValue}>
            {allowance.totalEarned}<Text style={styles.gaugeUnit}>P</Text>
            <Text style={styles.gaugeCap}>  /  {allowance.totalCap}P</Text>
          </Text>
        </View>
        <Pill label={settledBase ? '기본 한도 도달' : `${allowance.baseRemaining}P 남음`}
          tone={settledBase ? 'success' : 'accent'} />
      </View>

      <View style={styles.gaugeBars}>
        <LabeledBar label="기본 적립" value={allowance.baseEarned} cap={pointRules.weekly.base_points}
          color={tokens.color.accent} suffix="P" />
        <View style={styles.gaugeDivider} />
        <LabeledBar label="광고 부스터" value={allowance.bonusEarned} cap={pointRules.weekly.booster_points}
          color={tokens.color.indigo} suffix="P" />
      </View>

      <Text style={styles.gaugeNote}>{settledBase
        ? '이번 주 기본 적립을 모두 채웠어요. 기록은 그대로 남고 다음 주에 다시 쌓여요.'
        : `기본 한도까지 ${allowance.baseRemaining}P 남았어요. 부스터는 ${allowance.bonusRemaining}P 남았어요.`}</Text>
    </Card>

    {box.status !== 'disabled' && box.status !== 'locked' ? <Card tone="accent" style={styles.boxCard}>
      <View style={styles.boxHead}>
        <View style={styles.boxIcon}><Ionicons name="gift" size={18} color={tokens.color.accent} /></View>
        <View style={styles.flex}>
          <Text style={styles.boxTitle}>주간 보너스 상자</Text>
          <Text style={styles.boxBody}>{box.status === 'claimed'
            ? `${box.weekId} 정산 상자를 열었어요. +${box.bonusPoints}P가 적립 예정이에요.`
            : `${box.weekId} 정산을 마쳤어요. 광고 1편을 보면 ${box.bonusPoints}P를 더 드려요.`}</Text>
        </View>
      </View>
      {box.status === 'ready' ? <ActionButton
        label={boxPending
          ? adRewardPendingLabel({ kind: 'weekly_box' })
          : `광고 보고 ${box.bonusPoints}P 받기`}
        icon={<Ionicons name="play-circle-outline" size={19} color={tokens.color.onAccent} />}
        disabled={boost.isPending || boxPending}
        onPress={() => { setNotice(''); boost.mutate({ kind: 'weekly_box' }); }} /> : null}
    </Card> : null}

    {notice ? <Notice tone={noticeTone}>{notice}</Notice> : null}
    {points.isError || claims.isError ? <Notice tone="danger">포인트 기록을 불러오지 못했습니다.</Notice> : null}

    <SectionHeader title="최근 기록" caption="기록을 마친 뒤 광고 1편으로 적립을 2배로" />

    {sessions.isPending ? <View style={styles.loadingRow}>
      <ActivityIndicator color={tokens.color.accent} />
      <Text style={styles.hint}>기록을 불러오는 중이에요</Text>
    </View> : null}
    {sessions.isError ? <Card>
      <Text style={styles.emptyTitle}>기록을 불러오지 못했어요</Text>
      <ActionButton label="다시 불러오기" variant="secondary" onPress={() => { void sessions.refetch(); }} />
    </Card> : null}
    {sessions.data?.length === 0 ? <Card style={styles.emptyCard}>
      <View style={styles.emptyIcon}><Ionicons name="moon-outline" size={22} color={tokens.color.subtle} /></View>
      <Text style={styles.emptyTitle}>아직 기록이 없어요</Text>
      <Text style={styles.emptyBody}>홈에서 수면이나 집중 기록을 시작해 보세요.</Text>
    </Card> : null}

    {sessions.data?.map((item) => {
      const base = baseBySession.get(item.id);
      const claim = boosterBySession.get(item.id);
      const pending = pendingAds.some((placement) => placement.kind === 'settlement_booster'
        && placement.sessionId === item.id);
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
        baseCap={pointRules.weekly.base_points}
        busy={boost.isPending}
        pending={pending}
        onBoost={() => { setNotice(''); boost.mutate({ kind: 'settlement_booster', sessionId: item.id }); }} />;
    })}
  </Screen>;
}

const styles = StyleSheet.create({
  header: { gap: 3, marginTop: tokens.space.xs },
  eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 1.2, color: tokens.color.accent },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5, color: tokens.color.ink },
  subtitle: { fontSize: 13, lineHeight: 19, color: tokens.color.muted },
  flex: { flex: 1 },

  gaugeCard: { gap: tokens.space.md },
  gaugeHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: tokens.space.sm },
  gaugeLabel: { fontSize: 13, fontWeight: '600', color: tokens.color.muted },
  gaugeValue: { fontSize: 34, fontWeight: '800', letterSpacing: -0.8, color: tokens.color.ink, ...tokens.numeric },
  gaugeUnit: { fontSize: 18, fontWeight: '800', color: tokens.color.inkSecondary },
  gaugeCap: { fontSize: 14, fontWeight: '600', color: tokens.color.subtle },
  gaugeBars: { gap: tokens.space.sm },
  gaugeDivider: { height: 1, backgroundColor: tokens.color.line },
  gaugeNote: { fontSize: 12.5, lineHeight: 19, color: tokens.color.muted },

  boxCard: { gap: tokens.space.sm },
  boxHead: { flexDirection: 'row', alignItems: 'flex-start', gap: tokens.space.sm },
  boxIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: tokens.color.surface,
    alignItems: 'center', justifyContent: 'center' },
  boxTitle: { fontSize: 16, fontWeight: '800', color: tokens.color.accentStrong },
  boxBody: { fontSize: 13, lineHeight: 20, color: tokens.color.accentStrong, marginTop: 2 },

  recordCard: { gap: tokens.space.sm },
  recordHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.space.sm },
  recordLeft: { flexDirection: 'row', alignItems: 'center', gap: tokens.space.sm, flex: 1 },
  modeIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  modeIconDay: { backgroundColor: tokens.color.accentSoft },
  modeIconNight: { backgroundColor: tokens.color.night },
  recordIdentity: { flex: 1, gap: 1 },
  recordMode: { fontSize: 16, fontWeight: '800', color: tokens.color.ink },
  recordDate: { fontSize: 12.5, color: tokens.color.muted },
  recordBody: { gap: 3 },
  recordDuration: { fontSize: 28, fontWeight: '800', letterSpacing: -0.6, color: tokens.color.ink, ...tokens.numeric },
  recordDurationMuted: { color: tokens.color.muted },
  recordPoints: { fontSize: 14, fontWeight: '700', color: tokens.color.accentStrong },
  recordBoost: { fontSize: 13, fontWeight: '700', color: tokens.color.indigo },
  recordMeta: { fontSize: 12.5, lineHeight: 19, color: tokens.color.muted },

  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.space.xs, justifyContent: 'center' },
  hint: { fontSize: 13, color: tokens.color.muted },
  emptyCard: { alignItems: 'center', gap: tokens.space.xs, paddingVertical: tokens.space.xl },
  emptyIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: tokens.color.surfaceMuted,
    alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: tokens.color.ink },
  emptyBody: { fontSize: 13.5, lineHeight: 20, color: tokens.color.muted, textAlign: 'center' },
});
