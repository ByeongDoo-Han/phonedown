import { Ionicons } from '@expo/vector-icons';
import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/features/auth/AuthProvider';
import { useProfile } from '@/features/auth/useProfile';
import { tokens } from '@/theme/tokens';

export default function Entry() {
  const { session, loading } = useAuth();
  const profile = useProfile(session?.user.id);

  if (loading || (session && profile.isPending)) {
    return <View style={styles.center}>
      <View style={styles.mark}><Ionicons name="moon" size={24} color={tokens.color.moon} /></View>
      <ActivityIndicator color={tokens.color.accent} />
      <Text style={styles.caption}>오프라인 타임을 준비하고 있어요</Text>
    </View>;
  }
  if (!session) return <Redirect href="/(auth)/sign-in" />;
  if (profile.isError) {
    return <View style={styles.center}>
      <Ionicons name="cloud-offline-outline" size={28} color={tokens.color.subtle} />
      <Text style={styles.error}>계정 정보를 불러오지 못했습니다. 다시 시도해 주세요.</Text>
    </View>;
  }
  if (!profile.data?.onboarded_at) return <Redirect href="/(onboarding)/mode" />;
  return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: tokens.space.sm,
    paddingHorizontal: tokens.space.lg, backgroundColor: tokens.color.background },
  mark: { width: 52, height: 52, borderRadius: 17, backgroundColor: tokens.color.night,
    alignItems: 'center', justifyContent: 'center', marginBottom: tokens.space.xxs, ...tokens.shadow.card },
  caption: { fontSize: 13, color: tokens.color.muted },
  error: { fontSize: 14, lineHeight: 21, color: tokens.color.inkSecondary, textAlign: 'center' },
});
