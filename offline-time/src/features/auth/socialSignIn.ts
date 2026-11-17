import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { exchangeAuthCode } from '@/features/auth/exchangeAuthCode';
import { supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

export function getAuthRedirectUrl() {
  return makeRedirectUri({ scheme: 'offlinetime', path: 'auth/callback' });
}

export class OAuthDevelopmentBuildRequiredError extends Error {}

export async function signInWithProvider(provider: 'google' | 'apple') {
  if (!supabase) throw new Error('Supabase 연결 설정이 필요합니다.');
  const redirectTo = getAuthRedirectUrl();
  if (Platform.OS !== 'web' && /^exps?:\/\//.test(redirectTo)) {
    throw new OAuthDevelopmentBuildRequiredError('소셜 로그인은 개발 빌드에서 테스트해 주세요.');
  }
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: Platform.OS !== 'web' },
  });
  if (error) throw error;
  if (Platform.OS === 'web') return;
  if (!data.url) throw new Error('로그인 주소를 받지 못했습니다.');
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return;
  const code = new URL(result.url).searchParams.get('code');
  if (!code) throw new Error('로그인 인증 코드를 받지 못했습니다.');
  await exchangeAuthCode(code);
}
