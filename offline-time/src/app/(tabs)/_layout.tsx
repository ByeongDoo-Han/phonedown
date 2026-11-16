import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '@/features/auth/AuthProvider';
import { useProfile } from '@/features/auth/useProfile';
import { tokens } from '@/theme/tokens';

export default function TabsLayout() {
  const { session, loading } = useAuth();
  const profile = useProfile(session?.user.id);
  if (loading || (session && profile.isPending)) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator /></View>;
  if (!session) return <Redirect href="/(auth)/sign-in" />;
  if (!profile.data?.onboarded_at) return <Redirect href="/(onboarding)/mode" />;
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: tokens.color.accent,
    tabBarInactiveTintColor: tokens.color.muted, tabBarStyle: { backgroundColor: tokens.color.surface },
    tabBarLabelStyle: { fontSize: 14, fontWeight: '700' } }}>
    <Tabs.Screen name="index" options={{ title: '홈' }} />
    <Tabs.Screen name="records" options={{ title: '기록' }} />
    <Tabs.Screen name="store" options={{ title: '교환소' }} />
  </Tabs>;
}
