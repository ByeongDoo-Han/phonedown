import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { Card, SectionHeader } from '@/components/Card';
import { Notice } from '@/components/Pill';
import { Screen } from '@/components/Screen';
import { AccountDeletionError, clearLocalSession, countPendingRedemptions, deleteAccount } from '@/features/account/accountApi';
import { DELETION_CONFIRM_WORD, DELETION_CONSEQUENCES, canConfirmDeletion,
  deletionFailureText, pendingRedemptionWarning } from '@/features/account/accountPolicy';
import { adminIdentity } from '@/features/admin/adminApi';
import { useAuth } from '@/features/auth/AuthProvider';
import { legalDocument, supportEmail } from '@/features/legal/legalText';
import { supabase } from '@/lib/supabase';
import { tokens } from '@/theme/tokens';

type IconName = ComponentProps<typeof Ionicons>['name'];

function Row({ icon, label, caption, onPress, tone = 'default' }: {
  icon: IconName;
  label: string;
  caption?: string;
  onPress: () => void;
  tone?: 'default' | 'danger';
}) {
  const danger = tone === 'danger';
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
    <View style={[styles.rowIcon, danger && styles.rowIconDanger]}>
      <Ionicons name={icon} size={17} color={danger ? tokens.color.danger : tokens.color.accent} />
    </View>
    <View style={styles.flex}>
      <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>
      {caption ? <Text style={styles.rowCaption}>{caption}</Text> : null}
    </View>
    <Ionicons name="chevron-forward" size={16} color={tokens.color.subtle} />
  </Pressable>;
}

export default function Settings() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const email = session?.user.email ?? '';
  const [confirming, setConfirming] = useState(false);
  const [confirmWord, setConfirmWord] = useState('');
  const [pending, setPending] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [signingOut, setSigningOut] = useState(false);

  // 운영자 도구는 권한이 있는 사람에게만 보인다. 권한 확인은 서버가 하고, 없으면 조용히 사라진다.
  const identity = useQuery({
    queryKey: ['adminIdentity', userId],
    enabled: !!userId,
    queryFn: adminIdentity,
    retry: false,
    staleTime: 10 * 60_000,
  });

  // 모달을 먼저 열고, 발송 대기 건수는 도착하는 대로 채운다(네트워크를 기다리지 않는다).
  const openDelete = () => {
    setError('');
    setConfirmWord('');
    setPending(0);
    setConfirming(true);
    void countPendingRedemptions(userId).then(setPending);
  };

  const confirmDelete = async () => {
    setDeleting(true);
    setError('');
    try {
      await deleteAccount();
      await clearLocalSession();
      setConfirming(false);
      router.replace('/(auth)/sign-in');
    } catch (failure) {
      if (failure instanceof AccountDeletionError) {
        setError(failure.message || deletionFailureText(failure.status));
      } else {
        setError(deletionFailureText(null));
      }
    } finally {
      setDeleting(false);
    }
  };

  const signOut = async () => {
    setSigningOut(true);
    try {
      await supabase?.auth.signOut();
      router.replace('/(auth)/sign-in');
    } finally {
      setSigningOut(false);
    }
  };

  const warning = pendingRedemptionWarning(pending);
  const terms = legalDocument('terms');

  return <Screen>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="뒤로"
        onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/'); }}
        style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
        <Ionicons name="chevron-back" size={22} color={tokens.color.ink} />
      </Pressable>
      <Text style={styles.title}>설정</Text>
      <View style={styles.iconSpacer} />
    </View>

    <Card style={styles.accountCard}>
      <View style={styles.accountRow}>
        <View style={styles.avatar}><Ionicons name="person" size={18} color={tokens.color.onAccent} /></View>
        <View style={styles.flex}>
          <Text style={styles.accountLabel}>로그인 계정</Text>
          <Text style={styles.accountEmail} selectable>{email || '이메일 없음'}</Text>
        </View>
      </View>
      <Text style={styles.hint}>기록과 포인트는 이 계정에 저장돼요.</Text>
    </Card>

    <SectionHeader title="약관과 정책" />
    <Card style={styles.listCard}>
      <Row icon="document-text-outline" label={terms.title} caption={`최종 수정 ${terms.updatedAt}`}
        onPress={() => router.push({ pathname: '/legal', params: { doc: 'terms' } })} />
      <View style={styles.divider} />
      <Row icon="shield-checkmark-outline" label="개인정보처리방침" caption="어떤 정보를 받고 언제 지우는지"
        onPress={() => router.push({ pathname: '/legal', params: { doc: 'privacy' } })} />
    </Card>

    {identity.data?.admin ? <>
      <SectionHeader title="운영자" caption="발송 대기 중인 교환·쿠폰을 처리해요" />
      <Card style={styles.listCard}>
        <Row icon="construct-outline" label="운영자 도구" caption="교환·쿠폰 발송 처리"
          onPress={() => router.push('/admin')} />
      </Card>
    </> : null}

    <SectionHeader title="계정" />
    <Card style={styles.listCard}>
      <Row icon="log-out-outline" label={signingOut ? '로그아웃 중…' : '로그아웃'}
        onPress={() => { void signOut(); }} />
      <View style={styles.divider} />
      <Row icon="person-remove-outline" label="회원 탈퇴" tone="danger"
        caption="기록·포인트·쿠폰이 모두 지워져요" onPress={openDelete} />
    </Card>

    {error && !confirming ? <Notice tone="danger">{error}</Notice> : null}

    <Text style={styles.footer}>오프라인 타임 · 문의 {supportEmail()}</Text>

    <Modal visible={confirming} transparent animationType="fade" onRequestClose={() => setConfirming(false)}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.sheetIcon}>
            <Ionicons name="alert-circle" size={22} color={tokens.color.danger} />
          </View>
          <Text style={styles.sheetTitle}>정말 탈퇴할까요?</Text>
          <Text style={styles.sheetBody}>탈퇴하면 되돌릴 수 없어요.</Text>
          <View style={styles.consequences}>
            {DELETION_CONSEQUENCES.map((line) => <View key={line} style={styles.consequenceRow}>
              <View style={styles.bullet} />
              <Text style={styles.consequenceText}>{line}</Text>
            </View>)}
          </View>
          {warning ? <Notice tone="warning">{warning}</Notice> : null}
          <Text style={styles.confirmLabel}>확인을 위해 <Text style={styles.confirmWord}>{DELETION_CONFIRM_WORD}</Text>를 입력해 주세요.</Text>
          <TextInput accessibilityLabel="탈퇴 확인 입력" value={confirmWord} autoCorrect={false}
            onChangeText={setConfirmWord} placeholder={DELETION_CONFIRM_WORD}
            placeholderTextColor={tokens.color.subtle} style={styles.input} />
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <ActionButton label={deleting ? '탈퇴 처리 중…' : '탈퇴하고 모든 기록 삭제'}
            variant="primary" loading={deleting}
            disabled={!canConfirmDeletion(confirmWord) || deleting}
            onPress={() => { void confirmDelete(); }} />
          <ActionButton label="취소" variant="ghost" disabled={deleting}
            onPress={() => { setConfirming(false); setError(''); }} />
        </View>
      </View>
    </Modal>
  </Screen>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: tokens.space.xs },
  title: { fontSize: 20, fontWeight: '800', color: tokens.color.ink, letterSpacing: -0.3 },
  iconButton: { width: 38, height: 38, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: tokens.color.surface, borderWidth: 1, borderColor: tokens.color.line },
  iconSpacer: { width: 38 },
  pressed: { opacity: 0.7 },
  flex: { flex: 1 },
  accountCard: { gap: tokens.space.sm },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.space.sm },
  avatar: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
    backgroundColor: tokens.color.accentStrong },
  accountLabel: { fontSize: 12, fontWeight: '700', color: tokens.color.muted },
  accountEmail: { fontSize: 15.5, fontWeight: '700', color: tokens.color.ink },
  hint: { fontSize: 12.5, lineHeight: 18, color: tokens.color.muted },
  listCard: { paddingVertical: tokens.space.xxs, paddingHorizontal: 0, gap: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: tokens.space.sm,
    paddingHorizontal: tokens.space.md, paddingVertical: tokens.space.sm },
  rowIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: tokens.color.accentSoft },
  rowIconDanger: { backgroundColor: tokens.color.dangerSoft },
  rowLabel: { fontSize: 15, fontWeight: '700', color: tokens.color.ink },
  rowLabelDanger: { color: tokens.color.danger },
  rowCaption: { fontSize: 12, lineHeight: 17, color: tokens.color.muted, marginTop: 1 },
  divider: { height: 1, backgroundColor: tokens.color.line, marginLeft: 60 },
  footer: { fontSize: 11.5, color: tokens.color.subtle, textAlign: 'center' },

  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)', justifyContent: 'center',
    paddingHorizontal: tokens.space.lg },
  sheet: { backgroundColor: tokens.color.surface, borderRadius: tokens.radius.xl,
    padding: tokens.space.lg, gap: tokens.space.sm, ...tokens.shadow.lift },
  sheetIcon: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: tokens.color.dangerSoft },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: tokens.color.ink, letterSpacing: -0.3 },
  sheetBody: { fontSize: 13.5, lineHeight: 20, color: tokens.color.muted },
  consequences: { gap: 6, backgroundColor: tokens.color.surfaceMuted, borderRadius: tokens.radius.md,
    padding: tokens.space.sm },
  consequenceRow: { flexDirection: 'row', gap: tokens.space.xs, alignItems: 'flex-start' },
  bullet: { width: 4, height: 4, borderRadius: 2, backgroundColor: tokens.color.danger, marginTop: 7 },
  consequenceText: { flex: 1, fontSize: 12.5, lineHeight: 19, color: tokens.color.inkSecondary },
  confirmLabel: { fontSize: 13, color: tokens.color.inkSecondary },
  confirmWord: { fontWeight: '800', color: tokens.color.danger },
  input: { minHeight: 50, borderWidth: 1, borderColor: tokens.color.lineStrong,
    borderRadius: tokens.radius.md, paddingHorizontal: tokens.space.md, fontSize: 15.5,
    fontWeight: '700', color: tokens.color.ink, backgroundColor: tokens.color.surface },
});
