import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
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
        setNotice('초대 문구를 복사했어요. 친구에게 붙여 넣어 주세요.');
        return;
      }
      setNotice(`내 초대 코드는 ${code}예요.`);
      return;
    }
    try {
      await Share.share({ message });
    } catch {
      setNotice(`내 초대 코드는 ${code}예요.`);
    }
  };

  const enter = useMutation({
    mutationFn: (code: string) => enterReferralCode(code),
    onSuccess: (result) => {
      if (result.ok) {
        setCodeDraft('');
        setNotice(`초대 코드를 등록했어요. ${referral.data?.required_days ?? 3}일 연속 기록을 정산하면 `
          + `${formatPoints(referral.data?.points ?? 300)}를 받아요.`);
        refreshAll();
        return;
      }
      setNotice(referralFailText(result.reason));
    },
    onError: () => setNotice('초대 코드를 등록하지 못했어요. 잠시 뒤에 다시 시도해 주세요.'),
  });

  const join = useMutation({
    mutationFn: (challengeId: string) => joinChallenge(challengeId),
    onSuccess: (result) => {
      setNotice(result.ok ? '챌린지에 참여했어요. 오늘부터 기록이 쌓입니다.'
        : result.reason === 'already_completed' ? '이미 달성한 챌린지예요.'
          : result.reason === 'capacity' ? '참여 인원이 모두 찼어요.'
            : '지금은 참여할 수 없어요.');
      refreshAll();
    },
    onError: () => setNotice('챌린지에 참여하지 못했어요. 잠시 뒤에 다시 시도해 주세요.'),
  });

  const leave = useMutation({
    mutationFn: (challengeId: string) => leaveChallenge(challengeId),
    onSuccess: () => { setNotice('참여를 취소했어요.'); refreshAll(); },
    onError: () => setNotice('참여를 취소하지 못했어요.'),
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
    <Text style={styles.title}>혜택</Text>
    <Text style={styles.subtitle}>친구를 초대하고, 브랜드 챌린지로 쿠폰을 받아요.</Text>

    {unavailable ? <View style={styles.card}>
      <Text style={styles.heading}>친구 초대 준비 중</Text>
      <Text style={styles.body}>서버 업데이트가 끝나면 초대 코드를 만들 수 있어요.</Text>
    </View> : null}

    {referral.isPending ? <ActivityIndicator color={tokens.color.accent} /> : null}

    {summary ? <View style={styles.card}>
      <Text style={styles.heading}>친구 초대</Text>
      <Text style={styles.body}>친구가 내 코드를 넣고 {summary.required_days}일 연속 기록을 정산하면
        {' '}우리 둘 다 {formatPoints(summary.points)}를 받아요.</Text>
      {summary.code ? <>
        <Text style={styles.codeLabel}>내 초대 코드</Text>
        <Text style={styles.code} selectable>{summary.code}</Text>
        <ActionButton label="초대 코드 공유하기" secondary
          onPress={() => { void share(summary.code!, summary.points); }} />
      </> : <Text style={styles.body}>초대 코드를 만들지 못했어요. 잠시 뒤에 다시 열어 주세요.</Text>}
      <Text style={styles.body}>이번 달 {summary.monthly_completed}/{summary.monthly_limit}회 ·
        받은 포인트 {formatPoints(summary.monthly_points)}</Text>
      <Text style={styles.hint}>초대 한도는 달마다 {summary.monthly_limit}명,
        {' '}{formatPoints(summary.points * summary.monthly_limit)}까지예요.</Text>

      <Text style={styles.sectionTitle}>보낸 초대</Text>
      {summary.invites.length === 0
        ? <Text style={styles.body}>아직 보낸 초대가 없어요. 코드를 공유해 보세요.</Text>
        : summary.invites.map((invite) => <View key={invite.id} style={styles.inviteRow}>
          <View style={styles.inviteText}>
            <Text style={styles.inviteTitle}>{formatDay(invite.created_at)} 초대</Text>
            <Text style={styles.hint}>{statusLine(invite)}</Text>
          </View>
          <View style={[styles.pill, invite.status === 'completed' && styles.pillDone]}>
            <Text style={[styles.pillText, invite.status === 'completed' && styles.pillTextDone]}>
              {invite.status === 'completed' ? '완료' : '진행 중'}</Text>
          </View>
        </View>)}
    </View> : null}

    {summary ? <View style={styles.card}>
      <Text style={styles.heading}>초대 코드 입력</Text>
      <Text style={styles.body}>친구에게 받은 8자리 코드를 넣어 주세요. 기록이 없는 계정만 넣을 수 있어요.</Text>
      <TextInput accessibilityLabel="초대 코드" autoCapitalize="characters" autoCorrect={false}
        maxLength={8} value={codeDraft} placeholder="예: 3F7A9C21"
        onChangeText={(value) => setCodeDraft(normalizeReferralCode(value))}
        style={styles.input} />
      <ActionButton label="코드 등록" disabled={!isReferralCode(codeDraft) || enter.isPending}
        onPress={() => { setNotice(''); enter.mutate(codeDraft); }} />
    </View> : null}

    {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}

    <Text style={styles.sectionTitle}>브랜드 챌린지</Text>
    {challenges.isPending ? <ActivityIndicator color={tokens.color.accent} /> : null}
    {challenges.isError ? <View style={styles.card}>
      <Text style={styles.heading}>챌린지 준비 중</Text>
      <Text style={styles.body}>서버 업데이트가 끝나면 브랜드 챌린지가 여기에 보여요.</Text>
    </View> : null}
    {challenges.data?.length === 0 ? <View style={styles.card}>
      <Text style={styles.heading}>진행 중인 챌린지가 없어요</Text>
      <Text style={styles.body}>브랜드 제휴가 확정된 챌린지만 열어요. 계약 전에는 목록에 나오지 않아요.</Text>
    </View> : null}
    {challenges.data?.map((challenge) => (
      <ChallengeCard key={challenge.id} challenge={challenge}
        participation={partByChallenge.get(challenge.id)}
        coupon={couponByChallenge.get(challenge.id)}
        busy={join.isPending || leave.isPending}
        onJoin={() => { setNotice(''); join.mutate(challenge.id); }}
        onLeave={() => { setNotice(''); leave.mutate(challenge.id); }} />
    ))}
    <Text style={styles.hint}>챌린지 쿠폰은 포인트와 따로 발급돼요. 실제 사용은 브랜드 쿠폰함에서 해요.</Text>
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
  return <View style={styles.card}>
    <View style={styles.row}>
      <Text style={styles.badge}>{segmentLabel(challenge.segment)}</Text>
      {challenge.sponsors?.name
        ? <Text style={styles.sponsor}>{challenge.sponsors.name}</Text> : null}
    </View>
    <Text style={styles.heading}>{challenge.title}</Text>
    {challenge.description ? <Text style={styles.body}>{challenge.description}</Text> : null}
    <Text style={styles.body}>{challengeCondition(challenge)}</Text>
    <Text style={styles.reward}>보상 · {challenge.reward_title}
      {formatKrw(challenge.reward_value_krw) ? ` (${formatKrw(challenge.reward_value_krw)})` : ''}</Text>

    {participation ? <>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${percent}%` }]} />
      </View>
      <Text style={styles.body}>{challengeProgressLabel({
        status: participation.status, progress_days: progress,
        target_days: challenge.target_days, consecutive: challenge.consecutive,
      })}</Text>
    </> : null}

    {coupon ? <View style={styles.couponBox}>
      <Text style={styles.couponTitle}>쿠폰이 발급됐어요</Text>
      <Text style={styles.couponCode} selectable>{coupon.code}</Text>
      <Text style={styles.hint}>{coupon.delivery_status === 'sent'
        ? '브랜드 쿠폰함에서 확인할 수 있어요.'
        : '발송 준비 중이에요. 브랜드 쿠폰이 준비되면 안내드릴게요.'}</Text>
    </View> : null}

    {status === 'joined'
      ? <ActionButton label="참여 취소" secondary disabled={busy} onPress={onLeave} />
      : status === 'completed' ? null
        : <ActionButton label={status ? '다시 참여하기' : '참여하기'} disabled={busy} onPress={onJoin} />}
  </View>;
}

const styles = StyleSheet.create({
  title: { fontSize: 30, fontWeight: '800', color: tokens.color.ink, marginTop: 20 },
  subtitle: { color: tokens.color.muted, fontSize: 15 },
  card: { backgroundColor: tokens.color.surface, borderRadius: tokens.radius.lg, padding: 24, gap: 12 },
  heading: { fontSize: 20, fontWeight: '700', color: tokens.color.ink },
  sectionTitle: { fontSize: 19, fontWeight: '800', color: tokens.color.ink, marginTop: 12 },
  body: { fontSize: 15, lineHeight: 23, color: tokens.color.muted },
  hint: { fontSize: 13, lineHeight: 20, color: tokens.color.muted },
  codeLabel: { fontSize: 13, fontWeight: '700', color: tokens.color.muted },
  code: { fontSize: 34, fontWeight: '800', letterSpacing: 6, color: tokens.color.accent,
    fontVariant: ['tabular-nums'] },
  inviteRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  inviteText: { flex: 1, gap: 2 },
  inviteTitle: { fontSize: 15, fontWeight: '700', color: tokens.color.ink },
  pill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4,
    backgroundColor: tokens.color.background },
  pillDone: { backgroundColor: tokens.color.accentSoft },
  pillText: { fontSize: 12, fontWeight: '700', color: tokens.color.muted },
  pillTextDone: { color: tokens.color.accent },
  input: { minHeight: 52, borderWidth: 1, borderColor: tokens.color.line,
    borderRadius: tokens.radius.md, paddingHorizontal: 16, fontSize: 18, color: tokens.color.ink,
    letterSpacing: 3 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  badge: { fontSize: 12, fontWeight: '700', color: tokens.color.accent,
    backgroundColor: tokens.color.accentSoft, borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 4, overflow: 'hidden' },
  sponsor: { fontSize: 12, color: tokens.color.muted },
  reward: { fontSize: 15, fontWeight: '700', color: tokens.color.accent },
  track: { height: 8, borderRadius: 4, backgroundColor: tokens.color.line, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4, backgroundColor: tokens.color.accent },
  couponBox: { backgroundColor: tokens.color.accentSoft, borderRadius: tokens.radius.md,
    padding: 18, gap: 6 },
  couponTitle: { fontSize: 15, fontWeight: '700', color: tokens.color.accent },
  couponCode: { fontSize: 22, fontWeight: '800', letterSpacing: 2, color: tokens.color.ink },
  notice: { color: tokens.color.accent, fontSize: 14, lineHeight: 21 },
});
