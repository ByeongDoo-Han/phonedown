import { Redirect } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';

import { useAuth } from '@/features/auth/AuthProvider';
import { useProfile } from '@/features/auth/useProfile';
import { tokens } from '@/theme/tokens';

export default function Entry() {
  const { session, loading } = useAuth();
  const profile = useProfile(session?.user.id);

  if (loading || (session && profile.isPending)) {
    return <View style={{ flex: 1, justifyContent: 'center', backgroundColor: tokens.color.background }}><ActivityIndicator color={tokens.color.accent} /></View>;
  }
  if (!session) return <Redirect href="/(auth)/sign-in" />;
  if (profile.isError) {
    return <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}><Text>계정 정보를 불러오지 못했습니다. 다시 시도해 주세요.</Text></View>;
  }
  if (!profile.data?.onboarded_at) return <Redirect href="/(onboarding)/mode" />;
  return <Redirect href="/(tabs)" />;
}
