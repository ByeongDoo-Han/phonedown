import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState, type ComponentProps } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { Card, SectionHeader } from '@/components/Card';
import { Notice, Pill } from '@/components/Pill';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/features/auth/AuthProvider';
import { DEFAULT_POINT_RULES, getPointRules, pointRulesQueryKey } from '@/features/points/pointRulesApi';
import { formatPointRate, krwForPoints, pointsForKrw } from '@/features/points/rewardMath';
import { getWalletSummary, listProducts, listRedemptions, productsQueryKey,
  redemptionsQueryKey, requestRedemption, walletQueryKey } from '@/features/store/storeApi';
import { tokens } from '@/theme/tokens';

type IconName = ComponentProps<typeof Ionicons>['name'];
const formatPoints = (value: number) => `${value.toLocaleString('ko-KR')}P`;
const statusLabels = { requested: '신청', issued: '발송 완료', failed: '실패 · 환급' } as const;

export default function Store() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<{ productId: string; requestKey: string } | null>(null);
  const [phone, setPhone] = useState('');
  const [notice, setNotice] = useState('');
  const [noticeTone, setNoticeTone] = useState<'accent' | 'danger'>('accent');
  const wallet = useQuery({ queryKey: walletQueryKey(userId), enabled: !!userId,
    queryFn: getWalletSummary });
  const products = useQuery({ queryKey: productsQueryKey, enabled: !!userId,
    queryFn: listProducts });
  const history = useQuery({ queryKey: redemptionsQueryKey(userId), enabled: !!userId,
    queryFn: () => listRedemptions(userId!) });
  const rules = useQuery({ queryKey: pointRulesQueryKey, queryFn: getPointRules,
    staleTime: 5 * 60_000 });
  const pointRules = rules.data ?? DEFAULT_POINT_RULES;
  const formatWon = (points: number) => `${krwForPoints(points, pointRules.currency.krw_1000_points).toLocaleString('ko-KR')}원`;
  const selectedProduct = products.data?.find((item) => item.id === selected?.productId);
  const phoneValid = /^01[016789][0-9]{7,8}$/.test(phone.replace(/[^0-9]/g, ''));

  useFocusEffect(useCallback(() => {
    if (!userId) return;
    void queryClient.invalidateQueries({ queryKey: walletQueryKey(userId) });
    void queryClient.invalidateQueries({ queryKey: productsQueryKey });
    void queryClient.invalidateQueries({ queryKey: redemptionsQueryKey(userId) });
  }, [queryClient, userId]));

  const redeem = useMutation({
    mutationFn: () => requestRedemption(selected!.productId, phone, selected!.requestKey),
    onSuccess: () => {
      setSelected(null);
      setPhone('');
      setNoticeTone('accent');
      setNotice('교환 신청을 접수했습니다. 발송 상태는 아래에서 확인할 수 있어요.');
      void queryClient.invalidateQueries({ queryKey: walletQueryKey(userId) });
      void queryClient.invalidateQueries({ queryKey: redemptionsQueryKey(userId) });
      void queryClient.invalidateQueries({ queryKey: productsQueryKey });
    },
    onError: (error: Error) => {
      setNoticeTone('danger');
      setNotice(error.message || '교환 신청을 처리하지 못했습니다.');
    },
  });

  const confirmed = wallet.data?.confirmed_points ?? 0;
  const historyTone = (status: keyof typeof statusLabels) => {
    if (status === 'issued') return 'success' as const;
    if (status === 'failed') return 'danger' as const;
    return 'warning' as const;
  };

  return <Screen>
    <View style={styles.header}>
      <Text style={styles.eyebrow}>교환소</Text>
      <Text style={styles.title}>모은 포인트를 현금처럼</Text>
      <Text style={styles.subtitle}>확정된 포인트만 교환할 수 있어요.</Text>
    </View>

    <View style={styles.wallet}>
      <View style={styles.walletGlow} />
      <View style={styles.walletHead}>
        <Text style={styles.walletLabel}>교환 가능한 포인트</Text>
        <View style={styles.walletIcon}><Ionicons name="wallet" size={18} color={tokens.color.onAccent} /></View>
      </View>
      {wallet.isPending
        ? <ActivityIndicator color={tokens.color.onAccent} style={styles.walletLoading} />
        : <Text style={styles.walletBalance}>{formatPoints(confirmed)}</Text>}
      <View style={styles.walletRow}>
        <Text style={styles.walletMeta}>정산 전 {formatPoints(wallet.data?.pending_points ?? 0)}</Text>
        <Text style={styles.walletMeta}>
          {formatPoints(pointRules.currency.krw_1000_points)} = 1,000원
        </Text>
      </View>
      <View style={styles.walletDivider} />
      <View style={styles.walletFoot}>
        <Ionicons name="information-circle-outline" size={15} color={tokens.color.moon} />
        <Text style={styles.walletHint}>
          최소 {formatPoints(pointRules.redemption.minimum_points)}부터
          {' '}{pointRules.redemption.step_points}P 단위 · 1P ≈ {formatPointRate(pointRules.currency.point_to_krw)}
        </Text>
      </View>
      {wallet.isError ? <ActionButton label="포인트 다시 불러오기" variant="moon"
        onPress={() => { void wallet.refetch(); }} /> : null}
    </View>

    <View style={styles.exampleRow}>
      <View style={styles.exampleTile}>
        <Text style={styles.exampleLabel}>네이버페이 1,000원</Text>
        <Text style={styles.exampleValue}>{formatPoints(pointsForKrw(1000, pointRules.currency.krw_1000_points))}</Text>
      </View>
      <View style={styles.exampleTile}>
        <Text style={styles.exampleLabel}>상품권 5,000원</Text>
        <Text style={styles.exampleValue}>{formatPoints(pointsForKrw(5000, pointRules.currency.krw_1000_points))}</Text>
      </View>
    </View>

    <SectionHeader title="교환 상품" caption="확정된 포인트로 바로 신청" />
    {products.isPending ? <View style={styles.loadingRow}>
      <ActivityIndicator color={tokens.color.accent} />
      <Text style={styles.body}>상품을 불러오는 중이에요</Text>
    </View> : null}
    {products.isError ? <ActionButton label="상품 다시 불러오기" variant="secondary"
      onPress={() => { void products.refetch(); }} /> : null}
    {products.data?.length === 0 ? <Card style={styles.emptyCard}>
      <View style={styles.emptyIcon}><Ionicons name="cube-outline" size={22} color={tokens.color.subtle} /></View>
      <Text style={styles.cardTitle}>상품을 준비 중이에요</Text>
      <Text style={styles.body}>확정된 포인트는 그대로 유지됩니다.</Text>
    </Card> : null}
    {products.data?.map((product) => {
      const soldOut = product.stock !== null && product.stock <= 0;
      const short = confirmed < product.points;
      const icon: IconName = product.type === 'naverpay' ? 'card-outline' : 'gift-outline';
      return <Card key={product.id} style={styles.productCard}>
        <View style={styles.productHead}>
          <View style={styles.productIcon}><Ionicons name={icon} size={19} color={tokens.color.accent} /></View>
          <View style={styles.flex}>
            <Text style={styles.cardTitle}>{product.name}</Text>
            <Text style={styles.body}>{product.type === 'naverpay' ? '네이버페이 포인트' : '모바일 상품권'}</Text>
          </View>
          {soldOut ? <Pill label="품절" tone="neutral" /> : null}
        </View>
        <View style={styles.productFoot}>
          <Text style={styles.productPoints}>{formatPoints(product.points)}</Text>
          <Text style={styles.productWon}>{formatWon(product.points)} 상당</Text>
        </View>
        <ActionButton label={soldOut ? '품절' : short ? '포인트 부족' : '교환하기'}
          variant={soldOut || short ? 'secondary' : 'primary'}
          disabled={soldOut || short || !wallet.data || redeem.isPending}
          onPress={() => {
            setSelected({ productId: product.id, requestKey: Crypto.randomUUID() });
            setNotice('');
          }} />
      </Card>;
    })}

    {selectedProduct ? <Card tone="soft" style={styles.formCard}>
      <Text style={styles.cardTitle}>교환 신청 확인</Text>
      <View style={styles.formRow}>
        <Text style={styles.formLabel}>{selectedProduct.name}</Text>
        <Text style={styles.formValue}>{formatPoints(selectedProduct.points)}</Text>
      </View>
      <Text style={styles.body}>상품을 받을 휴대전화 번호</Text>
      <TextInput accessibilityLabel="휴대전화 번호" autoComplete="tel" textContentType="telephoneNumber"
        keyboardType="phone-pad" value={phone} onChangeText={setPhone} placeholder="010-1234-5678"
        placeholderTextColor={tokens.color.subtle} style={styles.input} />
      <Text style={styles.hint}>신청 후 발송 상태를 아래 교환 내역에서 확인할 수 있어요.</Text>
      <ActionButton label="교환 신청 확정" disabled={!phoneValid || redeem.isPending}
        loading={redeem.isPending}
        onPress={() => { setNotice(''); redeem.mutate(); }} />
      <ActionButton label="취소" variant="ghost" disabled={redeem.isPending}
        onPress={() => { setSelected(null); setPhone(''); }} />
    </Card> : null}
    {notice ? <Notice tone={noticeTone}>{notice}</Notice> : null}

    <SectionHeader title="교환 내역" />
    {history.isPending ? <View style={styles.loadingRow}>
      <ActivityIndicator color={tokens.color.accent} />
      <Text style={styles.body}>내역을 불러오는 중이에요</Text>
    </View> : null}
    {history.isError ? <ActionButton label="내역 다시 불러오기" variant="secondary"
      onPress={() => { void history.refetch(); }} /> : null}
    {history.data?.length === 0 ? <Text style={styles.hint}>아직 교환 내역이 없어요.</Text> : null}
    {history.data?.map((item) => <Card key={item.id} style={styles.historyCard}>
      <View style={styles.historyRow}>
        <View style={styles.productIcon}><Ionicons name="receipt-outline" size={18} color={tokens.color.muted} /></View>
        <View style={styles.flex}>
          <Text style={styles.cardTitle}>{formatPoints(item.points)} 교환</Text>
          <Text style={styles.hint}>{new Date(item.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</Text>
        </View>
        <Pill label={statusLabels[item.status]} tone={historyTone(item.status)} />
      </View>
    </Card>)}
  </Screen>;
}

const styles = StyleSheet.create({
  header: { gap: 3, marginTop: tokens.space.xs },
  eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 1.2, color: tokens.color.accent },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5, color: tokens.color.ink },
  subtitle: { fontSize: 13, lineHeight: 19, color: tokens.color.muted },
  flex: { flex: 1 },

  wallet: {
    backgroundColor: tokens.color.accentStrong, borderRadius: tokens.radius.xl,
    padding: tokens.space.lg, gap: tokens.space.sm, overflow: 'hidden', ...tokens.shadow.lift,
  },
  walletGlow: {
    position: 'absolute', width: 220, height: 220, borderRadius: 110, top: -110, right: -70,
    backgroundColor: 'rgba(199, 210, 254, 0.16)',
  },
  walletHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  walletLabel: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.82)' },
  walletIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)' },
  walletLoading: { alignSelf: 'flex-start', marginVertical: tokens.space.xs },
  walletBalance: { fontSize: 40, fontWeight: '800', letterSpacing: -1.2, color: tokens.color.onAccent, ...tokens.numeric },
  walletRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.space.sm },
  walletMeta: { fontSize: 12.5, fontWeight: '600', color: 'rgba(255,255,255,0.82)', ...tokens.numeric },
  walletDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.18)', marginVertical: 2 },
  walletFoot: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  walletHint: { flex: 1, fontSize: 12, lineHeight: 18, color: 'rgba(255,255,255,0.78)' },

  exampleRow: { flexDirection: 'row', gap: tokens.space.sm },
  exampleTile: { flex: 1, backgroundColor: tokens.color.surface, borderRadius: tokens.radius.md,
    borderWidth: 1, borderColor: tokens.color.line, padding: tokens.space.sm, gap: 2 },
  exampleLabel: { fontSize: 11.5, fontWeight: '600', color: tokens.color.muted },
  exampleValue: { fontSize: 16, fontWeight: '800', color: tokens.color.ink, ...tokens.numeric },

  productCard: { gap: tokens.space.sm },
  productHead: { flexDirection: 'row', alignItems: 'center', gap: tokens.space.sm },
  productIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
    backgroundColor: tokens.color.surfaceMuted },
  cardTitle: { fontSize: 16.5, fontWeight: '800', color: tokens.color.ink, letterSpacing: -0.2 },
  body: { fontSize: 13, lineHeight: 19, color: tokens.color.muted, marginTop: 1 },
  hint: { fontSize: 12.5, lineHeight: 19, color: tokens.color.muted },
  productFoot: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    gap: tokens.space.sm, backgroundColor: tokens.color.surfaceMuted, borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.space.sm, paddingVertical: tokens.space.xs },
  productPoints: { fontSize: 19, fontWeight: '800', color: tokens.color.ink, ...tokens.numeric },
  productWon: { fontSize: 12.5, fontWeight: '600', color: tokens.color.muted },

  formCard: { gap: tokens.space.sm, borderColor: tokens.color.line },
  formRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.space.sm },
  formLabel: { flex: 1, fontSize: 14, fontWeight: '700', color: tokens.color.inkSecondary },
  formValue: { fontSize: 14, fontWeight: '800', color: tokens.color.accent, ...tokens.numeric },
  input: {
    minHeight: 54, borderWidth: 1, borderColor: tokens.color.lineStrong,
    borderRadius: tokens.radius.md, paddingHorizontal: tokens.space.md,
    fontSize: 17, fontWeight: '600', color: tokens.color.ink, backgroundColor: tokens.color.surface,
  },

  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.space.xs, justifyContent: 'center' },
  emptyCard: { alignItems: 'center', gap: tokens.space.xs, paddingVertical: tokens.space.lg },
  emptyIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: tokens.color.surfaceMuted,
    alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  historyCard: { paddingVertical: tokens.space.md },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.space.sm },
});
