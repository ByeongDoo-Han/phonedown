import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/features/auth/AuthProvider';
import { DEFAULT_POINT_RULES, getPointRules, pointRulesQueryKey } from '@/features/points/pointRulesApi';
import { formatPointRate, krwForPoints } from '@/features/points/rewardMath';
import { getWalletSummary, listProducts, listRedemptions, productsQueryKey,
  redemptionsQueryKey, requestRedemption, walletQueryKey } from '@/features/store/storeApi';
import { tokens } from '@/theme/tokens';

const formatPoints = (value: number) => `${value.toLocaleString('ko-KR')}P`;
const statusLabels = { requested: '신청', issued: '발송 완료', failed: '실패 · 환급' };

export default function Store() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<{ productId: string; requestKey: string } | null>(null);
  const [phone, setPhone] = useState('');
  const [notice, setNotice] = useState('');
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
      setNotice('교환 신청을 접수했습니다. 발송 상태는 아래에서 확인할 수 있어요.');
      void queryClient.invalidateQueries({ queryKey: walletQueryKey(userId) });
      void queryClient.invalidateQueries({ queryKey: redemptionsQueryKey(userId) });
      void queryClient.invalidateQueries({ queryKey: productsQueryKey });
    },
    onError: (error: Error) => setNotice(error.message || '교환 신청을 처리하지 못했습니다.'),
  });

  return <Screen>
    <Text style={styles.title}>교환소</Text>
    <View style={styles.card}>
      <Text style={styles.heading}>교환 가능한 포인트</Text>
      {wallet.isPending ? <ActivityIndicator color={tokens.color.accent} />
        : <Text style={styles.balance}>{formatPoints(wallet.data?.confirmed_points ?? 0)}</Text>}
      {wallet.data ? <Text style={styles.body}>정산 전 포인트 {formatPoints(wallet.data.pending_points)}</Text> : null}
      <Text style={styles.body}>
        {formatPoints(pointRules.currency.krw_1000_points)} = 1,000원 · 1P ≈ {formatPointRate(pointRules.currency.point_to_krw)}
      </Text>
      <Text style={styles.body}>최소 {formatPoints(pointRules.redemption.minimum_points)}부터 {pointRules.redemption.step_points}P 단위로 교환할 수 있어요.</Text>
      {wallet.isError ? <ActionButton label="포인트 다시 불러오기" secondary
        onPress={() => { void wallet.refetch(); }} /> : null}
    </View>

    <Text style={styles.sectionTitle}>교환 상품</Text>
    {products.isPending ? <ActivityIndicator color={tokens.color.accent} /> : null}
    {products.isError ? <ActionButton label="상품 다시 불러오기" secondary
      onPress={() => { void products.refetch(); }} /> : null}
    {products.data?.length === 0 ? <View style={styles.card}>
      <Text style={styles.heading}>상품을 준비 중이에요</Text>
      <Text style={styles.body}>확정된 포인트는 그대로 유지됩니다.</Text>
    </View> : null}
    {products.data?.map((product) => {
      const soldOut = product.stock !== null && product.stock <= 0;
      const short = (wallet.data?.confirmed_points ?? 0) < product.points;
      return <View key={product.id} style={styles.card}>
        <Text style={styles.heading}>{product.name}</Text>
        <Text style={styles.body}>{product.type === 'naverpay' ? '네이버페이 포인트' : '모바일 상품권'} · {formatPoints(product.points)}</Text>
        <Text style={styles.body}>{formatWon(product.points)} 상당</Text>
        <ActionButton label={soldOut ? '품절' : short ? '포인트 부족' : '교환하기'}
          disabled={soldOut || short || !wallet.data || redeem.isPending}
          onPress={() => {
            setSelected({ productId: product.id, requestKey: Crypto.randomUUID() });
            setNotice('');
          }} />
      </View>;
    })}

    {selectedProduct ? <View style={styles.card}>
      <Text style={styles.heading}>교환 신청 확인</Text>
      <Text style={styles.body}>{selectedProduct.name} · {formatPoints(selectedProduct.points)} 차감</Text>
      <Text style={styles.body}>상품을 받을 휴대전화 번호</Text>
      <TextInput accessibilityLabel="휴대전화 번호" autoComplete="tel" textContentType="telephoneNumber"
        keyboardType="phone-pad" value={phone} onChangeText={setPhone} placeholder="010-1234-5678"
        style={styles.input} />
      <Text style={styles.body}>신청 후 발송 상태를 기록에서 확인할 수 있어요.</Text>
      <ActionButton label="교환 신청 확정" disabled={!phoneValid || redeem.isPending}
        onPress={() => { setNotice(''); redeem.mutate(); }} />
      <ActionButton label="취소" secondary disabled={redeem.isPending}
        onPress={() => { setSelected(null); setPhone(''); }} />
    </View> : null}
    {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}

    <Text style={styles.sectionTitle}>교환 내역</Text>
    {history.isPending ? <ActivityIndicator color={tokens.color.accent} /> : null}
    {history.isError ? <ActionButton label="내역 다시 불러오기" secondary
      onPress={() => { void history.refetch(); }} /> : null}
    {history.data?.length === 0 ? <Text style={styles.body}>아직 교환 내역이 없어요.</Text> : null}
    {history.data?.map((item) => <View key={item.id} style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.heading}>{formatPoints(item.points)} 교환</Text>
        <Text style={[styles.status, item.status === 'failed' && styles.failed]}>{statusLabels[item.status]}</Text>
      </View>
      <Text style={styles.body}>{new Date(item.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</Text>
    </View>)}
  </Screen>;
}

const styles = StyleSheet.create({
  title: { fontSize: 30, fontWeight: '800', color: tokens.color.ink, marginTop: 20 },
  sectionTitle: { fontSize: 19, fontWeight: '800', color: tokens.color.ink, marginTop: 12 },
  card: { backgroundColor: tokens.color.surface, borderRadius: tokens.radius.lg, padding: 24, gap: 12 },
  heading: { fontSize: 20, fontWeight: '700', color: tokens.color.ink },
  balance: { fontSize: 32, fontWeight: '800', color: tokens.color.accent },
  body: { fontSize: 15, lineHeight: 23, color: tokens.color.muted },
  input: { minHeight: 52, borderWidth: 1, borderColor: tokens.color.line, borderRadius: tokens.radius.md,
    paddingHorizontal: 16, fontSize: 16, color: tokens.color.ink },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  status: { color: tokens.color.accent, fontSize: 14, fontWeight: '700' },
  failed: { color: tokens.color.danger },
  notice: { color: tokens.color.accent, fontSize: 14, lineHeight: 21 },
});
