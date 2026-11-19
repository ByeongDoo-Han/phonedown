import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { Card, SectionHeader } from '@/components/Card';
import { Notice, Pill } from '@/components/Pill';
import { Screen } from '@/components/Screen';
import { adminIdentity, listFulfillment, markFailed, markFulfilled, sendFulfillment,
  AdminRequestError } from '@/features/admin/adminApi';
import { adminErrorText, couponState, fulfillmentCounts, itemSubtitle, itemTitle,
  modeGuidance, redemptionState, validReason, type AdminCoupon, type AdminRedemption,
  type FulfillmentKind } from '@/features/admin/fulfillmentView';
import { useAuth } from '@/features/auth/AuthProvider';
import { tokens } from '@/theme/tokens';

// 운영자 전용 화면. 탭에는 없고 설정 → 운영자 도구로만 들어온다. 운영자가 아니면 서버가 모든
// 요청을 403으로 거절하므로, 화면이 열려 있어도 아무것도 할 수 없다.
// 3단계: 교환 신청과 브랜드 쿠폰을 발송 처리하고, 실패하면 교환은 포인트를 환급한다.

type PendingAction = { kind: FulfillmentKind; id: string; action: 'fulfill' | 'fail' } | null;

const formatTime = (value: string) => new Date(value).toLocaleString('ko-KR', {
  timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
});

export default function AdminFulfillment() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();
  const [showResolved, setShowResolved] = useState(false);
  const [pending, setPending] = useState<PendingAction>(null);
  const [externalId, setExternalId] = useState('');
  const [memo, setMemo] = useState('');
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState('');
  const [noticeTone, setNoticeTone] = useState<'accent' | 'danger'>('accent');
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const identity = useQuery({
    queryKey: ['adminIdentity', userId],
    enabled: !!userId,
    queryFn: adminIdentity,
    retry: false,
  });
  const allowed = identity.data?.admin === true;
  const listKey = ['adminFulfillment', showResolved] as const;
  const items = useQuery({
    queryKey: listKey,
    enabled: allowed,
    queryFn: () => listFulfillment(showResolved),
  });

  const reset = () => {
    setPending(null);
    setExternalId('');
    setMemo('');
    setReason('');
  };

  const say = (message: string, tone: 'accent' | 'danger' = 'accent') => {
    setNoticeTone(tone);
    setNotice(message);
  };

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: listKey });
    setNowMs(Date.now());
  };

  const send = useMutation({
    mutationFn: (input: { kind: FulfillmentKind; id: string }) => sendFulfillment(input.kind, input.id),
    onSuccess: (result) => {
      say(result.instruction
        ?? result.message
        ?? (result.mode === 'manual' ? '직접 발송한 뒤 완료로 기록해 주세요.' : '공급자에게 발송을 접수했어요.'));
      refresh();
    },
    onError: (error: Error) => say(adminErrorText(error.message), 'danger'),
  });

  const fulfill = useMutation({
    mutationFn: (input: { kind: FulfillmentKind; id: string }) =>
      markFulfilled(input.kind, input.id, externalId, memo),
    onSuccess: () => { say('발송 완료로 기록했어요.'); reset(); refresh(); },
    onError: (error: Error) => say(adminErrorText(error.message), 'danger'),
  });

  const fail = useMutation({
    mutationFn: (input: { kind: FulfillmentKind; id: string }) =>
      markFailed(input.kind, input.id, reason),
    onSuccess: (_data, input) => {
      say(input.kind === 'redemption'
        ? '실패로 기록하고 포인트를 환급했어요.'
        : '실패로 기록했어요. 다시 시도할 수 있어요.');
      reset();
      refresh();
    },
    onError: (error: Error) => say(adminErrorText(error.message), 'danger'),
  });

  const busy = send.isPending || fulfill.isPending || fail.isPending;
  const mode = items.data?.mode ?? identity.data?.mode ?? 'manual';
  const guidance = modeGuidance(mode);
  const counts = fulfillmentCounts({
    redemptions: items.data?.redemptions ?? [],
    coupons: items.data?.coupons ?? [],
    nowMs,
  });

  const startAction = (next: NonNullable<PendingAction>) => {
    setNotice('');
    setPending(next);
    setExternalId('');
    setMemo('');
    setReason('');
  };

  const renderActions = (kind: FulfillmentKind, id: string, state: ReturnType<typeof redemptionState>) => <>
    {pending?.id === id && pending.action === 'fulfill' ? <View style={styles.form}>
      <Text style={styles.formLabel}>거래 번호(선택)</Text>
      <TextInput value={externalId} onChangeText={setExternalId} placeholder="예: 20261119-0001"
        autoCapitalize="characters" placeholderTextColor={tokens.color.subtle} style={styles.input}
        accessibilityLabel="거래 번호" />
      <Text style={styles.formLabel}>메모(선택)</Text>
      <TextInput value={memo} onChangeText={setMemo} placeholder="누구에게 어떤 방식으로 보냈는지"
        placeholderTextColor={tokens.color.subtle} style={styles.input} accessibilityLabel="발송 메모" />
      <ActionButton label="발송 완료로 기록" loading={fulfill.isPending} disabled={busy}
        onPress={() => fulfill.mutate({ kind, id })} />
      <ActionButton label="닫기" variant="ghost" disabled={busy} onPress={reset} />
    </View> : null}
    {pending?.id === id && pending.action === 'fail' ? <View style={styles.form}>
      <Text style={styles.formLabel}>실패 사유</Text>
      <TextInput value={reason} onChangeText={setReason} placeholder="예: 재고 소진 · 고객 번호 오류"
        placeholderTextColor={tokens.color.subtle} style={styles.input} accessibilityLabel="실패 사유" />
      <Text style={styles.hint}>{kind === 'redemption'
        ? '실패로 기록하면 포인트와 재고가 한 번만 되돌아가요.'
        : '쿠폰은 포인트가 아니라 상태만 바뀌어요. 실패 뒤 다시 시도할 수 있어요.'}</Text>
      <ActionButton label={kind === 'redemption' ? '실패 · 환급하기' : '실패로 기록'}
        loading={fail.isPending} disabled={busy || !validReason(reason)}
        onPress={() => fail.mutate({ kind, id })} />
      <ActionButton label="닫기" variant="ghost" disabled={busy} onPress={reset} />
    </View> : null}
    {pending?.id === id ? null : <View style={styles.actionRow}>
      {state.canSend ? <ActionButton label={mode === 'manual' ? '발송 잡기' : '자동 발송'}
        variant="primary" disabled={busy}
        onPress={() => send.mutate({ kind, id })} /> : null}
      {state.canFulfill ? <ActionButton label="발송 완료" variant={state.canSend ? 'secondary' : 'primary'}
        disabled={busy} onPress={() => startAction({ kind, id, action: 'fulfill' })} /> : null}
      {state.canFail ? <ActionButton label={kind === 'redemption' ? '실패 · 환급' : '실패'}
        variant="ghost" disabled={busy} onPress={() => startAction({ kind, id, action: 'fail' })} /> : null}
    </View>}
  </>;

  const renderRedemption = (item: AdminRedemption) => {
    const state = redemptionState(item, nowMs);
    return <Card key={item.id} style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.flex}>
          <Text style={styles.cardTitle}>{itemTitle('redemption', item)}</Text>
          <Text style={styles.cardSub}>{itemSubtitle('redemption', item)}</Text>
        </View>
        <Pill label={state.label} tone={state.tone} />
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.meta}>신청 {formatTime(item.created_at)}</Text>
        <Text style={styles.meta}>시도 {item.attempts}회</Text>
      </View>
      {state.note ? <Text style={styles.note}>{state.note}</Text> : null}
      {item.memo ? <Text style={styles.note}>메모 · {item.memo}</Text> : null}
      {renderActions('redemption', item.id, state)}
    </Card>;
  };

  const renderCoupon = (item: AdminCoupon) => {
    const state = couponState(item, nowMs);
    return <Card key={item.id} style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.flex}>
          <Text style={styles.cardTitle}>{itemTitle('coupon', item)}</Text>
          <Text style={styles.cardSub}>{itemSubtitle('coupon', item)}</Text>
        </View>
        <Pill label={state.label} tone={state.tone} />
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.meta}>발급 {formatTime(item.issued_at)}</Text>
        <Text style={styles.meta}>시도 {item.attempts}회</Text>
      </View>
      {state.note ? <Text style={styles.note}>{state.note}</Text> : null}
      {renderActions('coupon', item.id, state)}
    </Card>;
  };

  if (identity.isPending) {
    return <Screen><View style={styles.loading}>
      <ActivityIndicator color={tokens.color.accent} />
      <Text style={styles.hint}>운영자 권한을 확인하는 중이에요</Text>
    </View></Screen>;
  }

  if (!allowed) {
    return <Screen>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로"
          onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/'); }}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
          <Ionicons name="chevron-back" size={22} color={tokens.color.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>운영자 도구</Text>
        <View style={styles.iconSpacer} />
      </View>
      <Card style={styles.emptyCard}>
        <View style={styles.emptyIcon}><Ionicons name="lock-closed-outline" size={22} color={tokens.color.subtle} /></View>
        <Text style={styles.cardTitle}>운영자만 쓸 수 있어요</Text>
        <Text style={styles.hint}>{identity.data?.message
          ?? '이 계정은 운영자 목록(ADMIN_USER_IDS)에 없어요.'}</Text>
      </Card>
      {identity.error ? <Notice tone="danger">운영자 권한을 확인하지 못했어요.</Notice> : null}
    </Screen>;
  }

  return <Screen>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="뒤로"
        onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/'); }}
        style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
        <Ionicons name="chevron-back" size={22} color={tokens.color.ink} />
      </Pressable>
      <Text style={styles.headerTitle}>운영자 도구</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="새로고침" onPress={refresh}
        style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
        <Ionicons name="refresh" size={18} color={tokens.color.muted} />
      </Pressable>
    </View>

    <Card tone="soft" style={styles.modeCard}>
      <View style={styles.cardHead}>
        <View style={styles.flex}>
          <Text style={styles.cardTitle}>{guidance.title}</Text>
          <Text style={styles.hint}>{guidance.body}</Text>
        </View>
        <Pill label={mode === 'giftishow' ? '자동' : '수동'} tone={mode === 'giftishow' ? 'success' : 'neutral'} />
      </View>
      <View style={styles.countRow}>
        <Text style={styles.count}>대기 {counts.waiting}</Text>
        <Text style={styles.count}>발송 중 {counts.processing}</Text>
        <Text style={styles.count}>확인 필요 {counts.failed}</Text>
      </View>
    </Card>

    <Pressable accessibilityRole="switch" accessibilityState={{ checked: showResolved }}
      onPress={() => { setShowResolved((value) => !value); reset(); }}
      style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}>
      <Ionicons name={showResolved ? 'checkbox' : 'square-outline'} size={18}
        color={showResolved ? tokens.color.accent : tokens.color.subtle} />
      <Text style={styles.toggleText}>처리된 항목도 보기</Text>
    </Pressable>

    {notice ? <Notice tone={noticeTone}>{notice}</Notice> : null}
    {items.isError ? <Notice tone="danger">
      {items.error instanceof AdminRequestError ? items.error.message : '목록을 불러오지 못했어요.'}
    </Notice> : null}

    <SectionHeader title="교환 신청" caption="포인트를 쓴 상품 · 실패하면 환급" />
    {items.isPending ? <View style={styles.loading}>
      <ActivityIndicator color={tokens.color.accent} />
      <Text style={styles.hint}>불러오는 중이에요</Text>
    </View> : null}
    {items.data && items.data.redemptions.length === 0
      ? <Text style={styles.hint}>처리할 교환 신청이 없어요.</Text> : null}
    {items.data?.redemptions.map(renderRedemption)}

    <SectionHeader title="브랜드 쿠폰" caption="브랜드에 전달할 쿠폰 코드" />
    {items.data && items.data.coupons.length === 0
      ? <Text style={styles.hint}>처리할 쿠폰이 없어요.</Text> : null}
    {items.data?.coupons.map(renderCoupon)}

    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <Text style={styles.footer}>
        발송은 15분 동안 한 사람만 잡을 수 있어요. 모든 시도와 결과는 감사 로그에 남습니다.
      </Text>
    </ScrollView>
  </Screen>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: tokens.space.xs },
  headerTitle: { fontSize: 17, fontWeight: '800', color: tokens.color.ink },
  iconButton: { width: 38, height: 38, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: tokens.color.surface, borderWidth: 1, borderColor: tokens.color.line },
  iconSpacer: { width: 38 },
  pressed: { opacity: 0.7 },
  flex: { flex: 1 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: tokens.space.xs,
    justifyContent: 'center', marginTop: tokens.space.lg },
  modeCard: { gap: tokens.space.sm },
  countRow: { flexDirection: 'row', gap: tokens.space.sm, flexWrap: 'wrap' },
  count: { fontSize: 12.5, fontWeight: '700', color: tokens.color.inkSecondary,
    backgroundColor: tokens.color.surface, borderRadius: tokens.radius.pill,
    paddingHorizontal: 10, paddingVertical: 4, overflow: 'hidden' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start' },
  toggleText: { fontSize: 13, fontWeight: '600', color: tokens.color.inkSecondary },
  card: { gap: tokens.space.xs },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: tokens.space.sm },
  cardTitle: { fontSize: 15.5, fontWeight: '800', color: tokens.color.ink, letterSpacing: -0.2 },
  cardSub: { fontSize: 12.5, lineHeight: 18, color: tokens.color.muted, marginTop: 1 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: tokens.space.sm },
  meta: { fontSize: 11.5, fontWeight: '600', color: tokens.color.subtle },
  note: { fontSize: 12.5, lineHeight: 18, color: tokens.color.warning },
  hint: { fontSize: 12.5, lineHeight: 18, color: tokens.color.muted },
  actionRow: { flexDirection: 'row', gap: tokens.space.xs, flexWrap: 'wrap', marginTop: 2 },
  form: { gap: tokens.space.xs, backgroundColor: tokens.color.surfaceMuted,
    borderRadius: tokens.radius.md, padding: tokens.space.sm, marginTop: 2 },
  formLabel: { fontSize: 11.5, fontWeight: '700', color: tokens.color.muted, marginTop: 2 },
  input: { minHeight: 46, borderWidth: 1, borderColor: tokens.color.lineStrong,
    borderRadius: tokens.radius.sm, paddingHorizontal: tokens.space.sm, fontSize: 14,
    color: tokens.color.ink, backgroundColor: tokens.color.surface },
  emptyCard: { alignItems: 'center', gap: tokens.space.xs, paddingVertical: tokens.space.lg },
  emptyIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: tokens.color.surfaceMuted,
    alignItems: 'center', justifyContent: 'center' },
  footer: { fontSize: 11.5, lineHeight: 17, color: tokens.color.subtle, marginTop: tokens.space.sm },
});
