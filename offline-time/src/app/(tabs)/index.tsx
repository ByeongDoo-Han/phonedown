import { StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/features/auth/AuthProvider';
import { useProfile } from '@/features/auth/useProfile';
import { supabase } from '@/lib/supabase';
import { tokens } from '@/theme/tokens';

const labels = { sleep: '수면', focus: '집중', both: '수면과 집중' };

export default function Home() {
  const { session } = useAuth();
  const profile = useProfile(session?.user.id);
  const mode = profile.data?.primary_mode ?? 'both';
  return <Screen>
    <Text style={styles.eyebrow}>오프라인 타임</Text>
    <Text style={styles.title}>오늘의 오프라인</Text>
    <View style={styles.card}>
      <Text style={styles.status}>대기 중</Text>
      <Text style={styles.cardTitle}>{labels[mode]} 시간을 기록할 준비가 됐어요</Text>
      <Text style={styles.description}>시간 기록을 시작하면 여기에서 진행 상태를 볼 수 있어요.</Text>
    </View>
    <Text style={styles.hint}>선택한 주력 시간: {labels[mode]}</Text>
    <View style={styles.spacer} />
    <ActionButton label="로그아웃" secondary onPress={() => { void supabase?.auth.signOut(); }} />
  </Screen>;
}

const styles = StyleSheet.create({
  eyebrow: { color: tokens.color.accent, fontWeight: '700', marginTop: 20 },
  title: { fontSize: 30, fontWeight: '800', color: tokens.color.ink },
  card: { backgroundColor: tokens.color.surface, borderRadius: tokens.radius.lg, padding: 24, minHeight: 240,
    justifyContent: 'center', gap: 14, marginTop: 12 },
  status: { color: tokens.color.accent, fontWeight: '700', fontSize: 14 },
  cardTitle: { color: tokens.color.ink, fontSize: 23, lineHeight: 32, fontWeight: '800' },
  description: { color: tokens.color.muted, fontSize: 15, lineHeight: 23 },
  hint: { color: tokens.color.muted, fontSize: 14 },
  spacer: { flex: 1 },
});
