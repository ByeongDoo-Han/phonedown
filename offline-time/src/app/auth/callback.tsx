import { Ionicons } from '@expo/vector-icons';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { exchangeAuthCode } from '@/features/auth/exchangeAuthCode';
import { supabase } from '@/lib/supabase';
import { tokens } from '@/theme/tokens';

export default function AuthCallback() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    if (!code || !supabase) return;
    exchangeAuthCode(code)
      .then(() => setState('success'))
      .catch(() => setState('error'));
  }, [code]);

  if (state === 'success') return <Redirect href="/" />;
  return <View style={styles.center}>
    <View style={styles.mark}><Ionicons name="moon" size={24} color={tokens.color.moon} /></View>
    {state === 'loading' && code && supabase
      ? <>
        <ActivityIndicator color={tokens.color.accent} />
        <Text style={styles.caption}>로그인을 마무리하고 있어요</Text>
      </>
      : <>
        <Ionicons name="alert-circle-outline" size={26} color={tokens.color.danger} />
        <Text style={styles.error}>로그인을 마치지 못했습니다. 다시 시도해 주세요.</Text>
      </>}
  </View>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: tokens.space.sm,
    paddingHorizontal: tokens.space.lg, backgroundColor: tokens.color.background },
  mark: { width: 52, height: 52, borderRadius: 17, backgroundColor: tokens.color.night,
    alignItems: 'center', justifyContent: 'center', marginBottom: tokens.space.xxs, ...tokens.shadow.card },
  caption: { fontSize: 13, color: tokens.color.muted },
  error: { fontSize: 14, lineHeight: 21, color: tokens.color.inkSecondary, textAlign: 'center' },
});
