import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { Card, SectionHeader } from '@/components/Card';
import { ProgressBar } from '@/components/ProgressBar';
import { Notice, Pill } from '@/components/Pill';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/features/auth/AuthProvider';
import { challengesQueryKey, couponsQueryKey, joinChallenge, leaveChallenge,
  listChallenges, listCoupons, listParticipations, participationsQueryKey,
  type Challenge, type Participation, type SponsorCoupon } from '@/features/growth/challengeApi';
import { enterReferralCode, getReferralSummary, GROWTH_UNAVAILABLE,
  referralSummaryQueryKey, type ReferralSummary } from '@/features/growth/referralApi';
import { challengeCondition, challengeProgressLabel, formatKrw,
  isReferralCode, normalizeReferralCode, referralFailText, referralShareMessage,
  segmentLabel } from '@/features/growth/referralCode';
import { tokens } from '@/theme/tokens';

const formatPoints = (value: number) => `${value.toLocaleString('ko-KR')}P`;

function formatDay(value: string) {
  return new Date(value).toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric',
  });
}

function statusLine(invite: ReferralSummary['invites'][number]) {
  if (invite.status === 'completed') {
    return invite.inviter_points > 0
      ? `완료 · +${formatPoints(invite.inviter_points)}`
      : '완료 · 이번 달 초대 한도를 채웠어요';
  }
  if (invite.status === 'void') return '취소됨';
  return `진행 ${Math.min(invite.progress_days, invite.required_days)}/${invite.required_days}일`;
}

export default function Benefits() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();
  const [codeDraft, setCodeDraft] = useState('');
  const [notice, setNotice] = useState('');
  const [noticeTone, setNoticeTone] = useState<'accent' | 'danger'>('accent');

  const referral = useQuery({
    queryKey: referralSummaryQueryKey(userId),
    enabled: !!userId,
    queryFn: getReferralSummary,
    retry: false,
  });
  const challenges = useQuery({
    queryKey: challengesQueryKey,
    enabled: !!userId,
    queryFn: listChallenges,
    retry: false,
  });
  const participations = useQuery({
    queryKey: participationsQueryKey(userId),
    enabled: !!userId,
    queryFn: () => listParticipations(userId!),
    retry: false,
  });
  const coupons = useQuery({
    queryKey: couponsQueryKey(userId),
    enabled: !!userId,
    queryFn: () => listCoupons(userId!),
    retry: false,
  });

  const say = (message: string, tone: 'accent' | 'danger' = 'accent') => {
    setNoticeTone(tone);
    setNotice(message);
  };

  const refreshAll = useCallback(() => {
    if (!userId) return;
    void queryClient.invalidateQueries({ queryKey: referralSummaryQueryKey(userId) });
    void queryClient.invalidateQueries({ queryKey: challengesQueryKey });
    void queryClient.invalidateQueries({ queryKey: participationsQueryKey(userId) });
    void queryClient.invalidateQueries({ queryKey: couponsQueryKey(userId) });
  }, [queryClient, userId]);

  useFocusEffect(useCallback(() => { refreshAll(); }, [refreshAll]));

  const share = async (code: string, points: number) => {
    const message = referralShareMessage(code, points);
    if (Platform.OS === 'web') {
      const clipboard = (globalThis as {
        navigator?: { clipboard?: { writeText?: (text: string) => Promise<void> } };
      }).navigator?.clipboard;
      if (clipboard?.writeText) {
        await clipboard.writeText(message);
        say('초대 문구를 복사했어요. 친구에게 붙여 넣어 주세요.');
        return;
      }
      say(`내 초대 코드는 ${code}예요.`);
      return;
    }
    try {
      await Share.share({ message });
    } catch {
      say(`내 초대 코드는 ${code}예요.`);
    }
  };

  const enter = useMutation({
    mutationFn: (code: string) => enterReferralCode(code),
    onSuccess: (result) => {
      if (result.ok) {
        setCodeDraft('');
        say(`초대 코드를 등록했어요. ${referral.data?.required_days ?? 3}일 연속 기록을 정산하면 `
          + `${formatPoints(referral.data?.points ?? 300)}를 받아요.`);
        refreshAll();
        return;
      }
      say(referralFailText(result.reason), 'danger');
    },
    onError: () => say('초대 코드를 등록하지 못했어요. 잠시 뒤에 다시 시도해 주세요.', 'danger'),
  });

  const join = useMutation({
    mutationFn: (challengeId: string) => joinChallenge(challengeId),
    onSuccess: (result) => {
      say(result.ok ? '챌린지에 참여했어요. 오늘부터 기록이 쌓입니다.'
        : result.reason === 'already_completed' ? '이미 달성한 챌린지예요.'
          : result.reason === 'capacity' ? '참여 인원이 모두 찼어요.'
            : '지금은 참여할 수 없어요.', result.ok ? 'accent' : 'danger');
      refreshAll();
    },
    onError: () => say('챌린지에 참여하지 못했어요. 잠시 뒤에 다시 시도해 주세요.', 'danger'),
  });

  const leave = useMutation({
    mutationFn: (challengeId: string) => leaveChallenge(challengeId),
    onSuccess: () => { say('참여를 취소했어요.'); refreshAll(); },
    onError: () => say('참여를 취소하지 못했어요.', 'danger'),
  });

  const summary = referral.data;
  const unavailable = referral.isError && (referral.error as Error).message === GROWTH_UNAVAILABLE;
  const partByChallenge = new Map<string, Participation>();
  for (const item of participations.data ?? []) partByChallenge.set(item.challenge_id, item);
  const couponByChallenge = new Map<string, SponsorCoupon>();
  for (const coupon of coupons.data ?? []) {
    if (!couponByChallenge.has(coupon.challenge_id)) {
      couponByChallenge.set(coupon.challenge_id, coupon);
    }
  }

  return <Screen>
    <View style={styles.header}>
      <Text style={styles.eyebrow}>혜택</Text>
      <Text style={styles.title}>친구와 함께 모으는 포인트</Text>
      <Text style={styles.subtitle}>친구를 초대하고, 브랜드 챌린지로 쿠폰을 받아요.</Text>
    </View>

    {unavailable ? <Card>
      <View style={styles.row}>
        <View style={styles.iconCircle}><Ionicons name="rocket-outline" size={18} color={tokens.color.accent} /></View>
        <View style={styles.flex}>
          <Text style={styles.cardTitle}>친구 초대 준비 중</Text>
          <Text style={styles.body}>서버 업데이트가 끝나면 초대 코드를 만들 수 있어요.</Text>
        </View>
      </View>
    </Card> : null}

    {referral.isPending ? <View style={styles.loadingRow}>
      <ActivityIndicator color={tokens.color.accent} />
      <Text style={styles.hint}>초대 정보를 불러오는 중이에요</Text>
    </View> : null}

    {summary ? <Card style={styles.referralCard}>
      <View style={styles.row}>
        <View style={styles.iconCircle}><Ionicons name="people" size={18} color={tokens.color.accent} /></View>
        <View style={styles.flex}>
          <Text style={styles.cardTitle}>친구 초대</Text>
          <Text style={styles.body}>친구가 내 코드를 넣고 {summary.required_days}일 연속 기록을 정산하면
            {' '}우리 둘 다 {formatPoints(summary.points)}를 받아요.</Text>
        </View>
      </View>

      {summary.code ? <>
        <View style={styles.codeBox}>
          <Text style={styles.codeLabel}>내 초대 코드</Text>
          <Text style={styles.code} selectable>{summary.code}</Text>
          <Text style={styles.codeHint}>친구에게 8자리 코드를 그대로 알려 주세요</Text>
        </View>
        <ActionButton label="초대 코드 공유하기" variant="secondary"
          icon={<Ionicons name="share-social-outline" size={18} color={tokens.color.ink} />}
          onPress={() => { void share(summary.code!, summary.points); }} />
      </> : <Text style={styles.body}>초대 코드를 만들지 못했어요. 잠시 뒤에 다시 열어 주세요.</Text>}

      <View style={styles.statRow}>
        <View style={styles.statTile}>
          <Text style={styles.statLabel}>이번 달 완료</Text>
          <Text style={styles.statValue}>{summary.monthly_completed}<Text style={styles.statUnit}> / {summary.monthly_limit}회</Text></Text>
        </View>
        <View style={styles.statTile}>
          <Text style={styles.statLabel}>받은 포인트</Text>
          <Text style={styles.statValue}>{formatPoints(summary.monthly_points)}</Text>
        </View>
      </View>
      <Text style={styles.hint}>초대 한도는 달마다 {summary.monthly_limit}명,
        {' '}{formatPoints(summary.points * summary.monthly_limit)}까지예요.</Text>

      <View style={styles.divider} />
      <Text style={styles.sectionLabel}>보낸 초대</Text>
      {summary.invites.length === 0
        ? <Text style={styles.body}>아직 보낸 초대가 없어요. 코드를 공유해 보세요.</Text>
        : summary.invites.map((invite) => <View key={invite.id} style={styles.inviteRow}>
          <View style={styles.flex}>
            <Text style={styles.inviteTitle}>{formatDay(invite.created_at)} 초대</Text>
            <Text style={styles.hint}>{statusLine(invite)}</Text>
          </View>
          <Pill label={invite.status === 'completed' ? '완료' : '진행 중'}
            tone={invite.status === 'completed' ? 'accent' : 'neutral'} />
        </View>)}
    </Card> : null}

    {summary ? <Card style={styles.enterCard}>
      <View style={styles.row}>
        <View style={[styles.iconCircle, styles.iconCircleIndigo]}>
          <Ionicons name="keypad-outline" size={18} color={tokens.color.indigo} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.cardTitle}>초대 코드 입력</Text>
          <Text style={styles.body}>친구에게 받은 8자리 코드를 넣어 주세요.</Text>
        </View>
      </View>
      <TextInput accessibilityLabel="초대 코드" autoCapitalize="characters" autoCorrect={false}
        maxLength={8} value={codeDraft} placeholder="예: 3F7A9C21" placeholderTextColor={tokens.color.subtle}
        onChangeText={(value) => setCodeDraft(normalizeReferralCode(value))}
        style={styles.input} />
      <Text style={styles.hint}>기록이 없는 계정만 넣을 수 있어요.</Text>
      <ActionButton label="코드 등록" disabled={!isReferralCode(codeDraft) || enter.isPending}
        loading={enter.isPending}
        onPress={() => { setNotice(''); enter.mutate(codeDraft); }} />
    </Card> : null}

    {notice ? <Notice tone={noticeTone}>{notice}</Notice> : null}

    <SectionHeader title="브랜드 챌린지" caption="달성하면 쿠폰으로 보상해요" />
    {challenges.isPending ? <View style={styles.loadingRow}>
      <ActivityIndicator color={tokens.color.accent} />
      <Text style={styles.hint}>챌린지를 불러오는 중이에요</Text>
    </View> : null}
    {challenges.isError ? <Card>
      <Text style={styles.cardTitle}>챌린지 준비 중</Text>
      <Text style={styles.body}>서버 업데이트가 끝나면 브랜드 챌린지가 여기에 보여요.</Text>
    </Card> : null}
    {challenges.data?.length === 0 ? <Card style={styles.emptyCard}>
      <View style={styles.emptyIcon}><Ionicons name="ribbon-outline" size={22} color={tokens.color.subtle} /></View>
      <Text style={styles.cardTitle}>진행 중인 챌린지가 없어요</Text>
      <Text style={styles.body}>브랜드 제휴가 확정된 챌린지만 열어요. 계약 전에는 목록에 나오지 않아요.</Text>
    </Card> : null}
    {challenges.data?.map((challenge) => (
      <ChallengeCard key={challenge.id} challenge={challenge}
        participation={partByChallenge.get(challenge.id)}
        coupon={couponByChallenge.get(challenge.id)}
        busy={join.isPending || leave.isPending}
        onJoin={() => { setNotice(''); join.mutate(challenge.id); }}
        onLeave={() => { setNotice(''); leave.mutate(challenge.id); }} />
    ))}
    <Text style={styles.footerHint}>챌린지 쿠폰은 포인트와 따로 발급돼요. 실제 사용은 브랜드 쿠폰함에서 해요.</Text>
  </Screen>;
}

function ChallengeCard({ challenge, participation, coupon, busy, onJoin, onLeave }: {
  challenge: Challenge;
  participation: Participation | undefined;
  coupon: SponsorCoupon | undefined;
  busy: boolean;
  onJoin: () => void;
  onLeave: () => void;
}) {
  const status = participation?.status;
  const progress = participation?.progress_days ?? 0;
  const percent = challenge.target_days > 0
    ? Math.min(100, Math.round((Math.min(progress, challenge.target_days) / challenge.target_days) * 100))
    : 0;
  const done = status === 'completed';
  return <Card style={styles.challengeCard}>
    <View style={styles.row}>
      <Pill label={segmentLabel(challenge.segment)}
        tone={challenge.segment === 'sleep_recovery' ? 'lavender' : 'indigo'} />
      {challenge.sponsors?.name
        ? <Text style={styles.sponsor}>{challenge.sponsors.name}</Text> : null}
    </View>
    <Text style={styles.challengeTitle}>{challenge.title}</Text>
    {challenge.description ? <Text style={styles.body}>{challenge.description}</Text> : null}
    <Text style={styles.condition}>{challengeCondition(challenge)}</Text>
    <View style={styles.rewardRow}>
      <Ionicons name="gift-outline" size={16} color={tokens.color.accent} />
      <Text style={styles.reward}>보상 · {challenge.reward_title}
        {formatKrw(challenge.reward_value_krw) ? ` (${formatKrw(challenge.reward_value_krw)})` : ''}</Text>
    </View>

    {participation ? <View style={styles.progressBlock}>
      <View style={styles.progressHead}>
        <Text style={styles.hint}>{done ? '달성' : '진행률'}</Text>
        <Text style={styles.progressValue}>{percent}%</Text>
      </View>
      <ProgressBar value={percent} cap={100} color={done ? tokens.color.success : tokens.color.accent} />
      <Text style={styles.hint}>{challengeProgressLabel({
        status: participation.status, progress_days: progress,
        target_days: challenge.target_days, consecutive: challenge.consecutive,
      })}</Text>
    </View> : null}

    {coupon ? <View style={styles.couponBox}>
      <Text style={styles.couponTitle}>쿠폰이 발급됐어요</Text>
      <Text style={styles.couponCode} selectable>{coupon.code}</Text>
      <Text style={styles.hint}>{coupon.delivery_status === 'sent'
        ? '브랜드 쿠폰함에서 확인할 수 있어요.'
        : '발송 준비 중이에요. 브랜드 쿠폰이 준비되면 안내드릴게요.'}</Text>
    </View> : null}

    {status === 'joined'
      ? <ActionButton label="참여 취소" variant="secondary" disabled={busy} onPress={onLeave} />
      : status === 'completed' ? null
        : <ActionButton label={status ? '다시 참여하기' : '참여하기'} disabled={busy} loading={busy}
          onPress={onJoin} />}
  </Card>;
}

const styles = StyleSheet.create({
  header: { gap: 3, marginTop: tokens.space.xs },
  eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 1.2, color: tokens.color.accent },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5, color: tokens.color.ink },
  subtitle: { fontSize: 13, lineHeight: 19, color: tokens.color.muted },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: tokens.space.sm },
  iconCircle: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
    backgroundColor: tokens.color.accentSoft },
  iconCircleIndigo: { backgroundColor: tokens.color.indigoSoft },
  cardTitle: { fontSize: 17, fontWeight: '800', color: tokens.color.ink, letterSpacing: -0.2 },
  body: { fontSize: 13.5, lineHeight: 20, color: tokens.color.muted, marginTop: 2 },
  hint: { fontSize: 12.5, lineHeight: 19, color: tokens.color.muted },
  sectionLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4, color: tokens.color.subtle },
  divider: { height: 1, backgroundColor: tokens.color.line, marginVertical: tokens.space.xxs },

  referralCard: { gap: tokens.space.sm },
  codeBox: {
    borderRadius: tokens.radius.md, borderWidth: 1, borderStyle: 'dashed',
    borderColor: tokens.color.accentLine, backgroundColor: tokens.color.accentSoft,
    paddingVertical: tokens.space.md, paddingHorizontal: tokens.space.md, alignItems: 'center', gap: 2,
  },
  codeLabel: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.6, color: tokens.color.accentStrong },
  code: { fontSize: 32, fontWeight: '800', letterSpacing: 6, color: tokens.color.accentStrong,
    ...tokens.numeric },
  codeHint: { fontSize: 11.5, color: tokens.color.accentStrong, opacity: 0.75 },
  statRow: { flexDirection: 'row', gap: tokens.space.sm },
  statTile: { flex: 1, backgroundColor: tokens.color.surfaceMuted, borderRadius: tokens.radius.md,
    padding: tokens.space.sm, gap: 2 },
  statLabel: { fontSize: 11.5, fontWeight: '600', color: tokens.color.muted },
  statValue: { fontSize: 18, fontWeight: '800', color: tokens.color.ink, ...tokens.numeric },
  statUnit: { fontSize: 12, fontWeight: '600', color: tokens.color.muted },
  inviteRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.space.sm, paddingVertical: 6 },
  inviteTitle: { fontSize: 14, fontWeight: '700', color: tokens.color.inkSecondary },

  enterCard: { gap: tokens.space.sm },
  input: {
    minHeight: 54, borderWidth: 1, borderColor: tokens.color.lineStrong,
    borderRadius: tokens.radius.md, paddingHorizontal: tokens.space.md,
    fontSize: 20, fontWeight: '700', color: tokens.color.ink, letterSpacing: 4,
    backgroundColor: tokens.color.surfaceMuted,
  },

  challengeCard: { gap: tokens.space.xs },
  sponsor: { fontSize: 12, color: tokens.color.muted, fontWeight: '600' },
  challengeTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3, color: tokens.color.ink, marginTop: 2 },
  condition: { fontSize: 13, color: tokens.color.inkSecondary, fontWeight: '600' },
  rewardRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: tokens.color.accentSoft,
    borderRadius: tokens.radius.sm, paddingVertical: 8, paddingHorizontal: tokens.space.sm, marginTop: 2 },
  reward: { flex: 1, fontSize: 13, fontWeight: '700', color: tokens.color.accentStrong },
  progressBlock: { gap: 6, marginTop: 2 },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  progressValue: { fontSize: 13, fontWeight: '800', color: tokens.color.accent, ...tokens.numeric },
  couponBox: { backgroundColor: tokens.color.surfaceMuted, borderRadius: tokens.radius.md,
    padding: tokens.space.sm, gap: 4 },
  couponTitle: { fontSize: 13.5, fontWeight: '700', color: tokens.color.ink },
  couponCode: { fontSize: 20, fontWeight: '800', letterSpacing: 2, color: tokens.color.ink, ...tokens.numeric },

  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.space.xs, justifyContent: 'center' },
  emptyCard: { alignItems: 'center', gap: tokens.space.xs, paddingVertical: tokens.space.lg },
  emptyIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: tokens.color.surfaceMuted,
    alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  footerHint: { fontSize: 12, lineHeight: 18, color: tokens.color.subtle, textAlign: 'center', marginTop: tokens.space.xs },
});
