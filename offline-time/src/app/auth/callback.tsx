import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { exchangeAuthCode } from '@/features/auth/exchangeAuthCode';
import { supabase } from '@/lib/supabase';

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
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
    {state === 'loading' && code && supabase ? <ActivityIndicator /> : <Text>로그인을 마치지 못했습니다. 다시 시도해 주세요.</Text>}
  </View>;
}
