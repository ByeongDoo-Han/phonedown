import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/features/auth/AuthProvider';
import { useProfile } from '@/features/auth/useProfile';
import { tokens } from '@/theme/tokens';

type IconName = ComponentProps<typeof Ionicons>['name'];

const icons: Record<string, { active: IconName; idle: IconName }> = {
  index: { active: 'home', idle: 'home-outline' },
  records: { active: 'bar-chart', idle: 'bar-chart-outline' },
  benefits: { active: 'gift', idle: 'gift-outline' },
  store: { active: 'wallet', idle: 'wallet-outline' },
};

export default function TabsLayout() {
  const { session, loading } = useAuth();
  const profile = useProfile(session?.user.id);
  const insets = useSafeAreaInsets();
  if (loading || (session && profile.isPending)) {
    return <View style={styles.loading}><ActivityIndicator color={tokens.color.accent} /></View>;
  }
  if (!session) return <Redirect href="/(auth)/sign-in" />;
  if (!profile.data?.onboarded_at) return <Redirect href="/(onboarding)/mode" />;
  return <Tabs screenOptions={({ route }) => ({
    headerShown: false,
    tabBarActiveTintColor: tokens.color.accent,
    tabBarInactiveTintColor: tokens.color.subtle,
    tabBarStyle: {
      backgroundColor: tokens.color.surface,
      borderTopColor: tokens.color.line,
      borderTopWidth: 1,
      height: 58 + insets.bottom,
      paddingTop: 6,
      paddingBottom: insets.bottom + 4,
    },
    tabBarLabelStyle: { fontSize: 11, fontWeight: '700', letterSpacing: -0.1 },
    tabBarItemStyle: { paddingVertical: 0 },
    tabBarIcon: ({ focused, color, size }) => {
      const icon = icons[route.name] ?? { active: 'ellipse', idle: 'ellipse-outline' };
      return <Ionicons name={focused ? icon.active : icon.idle} size={size ?? 22} color={typeof color === 'string' ? color : tokens.color.subtle} />;
    },
  })}>
    <Tabs.Screen name="index" options={{ title: '홈' }} />
    <Tabs.Screen name="records" options={{ title: '기록' }} />
    <Tabs.Screen name="benefits" options={{ title: '혜택' }} />
    <Tabs.Screen name="store" options={{ title: '교환소' }} />
  </Tabs>;
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', backgroundColor: tokens.color.background },
});
