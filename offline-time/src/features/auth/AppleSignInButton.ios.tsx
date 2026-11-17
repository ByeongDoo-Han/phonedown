import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

import { supabase } from '@/lib/supabase';

export function AppleSignInButton({ disabled, onError }: { disabled: boolean; onError: () => void }) {
  return <AppleAuthentication.AppleAuthenticationButton
    buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
    buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
    cornerRadius={14}
    style={{ height: 52, opacity: disabled ? 0.5 : 1 }}
    onPress={() => {
      const client = supabase;
      if (disabled || !client) return;
      void (async () => {
        try {
          const nonce = Crypto.randomUUID();
          const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
          const credential = await AppleAuthentication.signInAsync({
            nonce: hashedNonce,
            requestedScopes: [
              AppleAuthentication.AppleAuthenticationScope.EMAIL,
              AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            ],
          });
          if (!credential.identityToken) throw new Error('Apple 인증 정보가 없습니다.');
          const { error } = await client.auth.signInWithIdToken({
            provider: 'apple',
            token: credential.identityToken,
            nonce,
          });
          if (error) throw error;
        } catch (error) {
          if ((error as { code?: string }).code !== 'ERR_REQUEST_CANCELED') onError();
        }
      })();
    }}
  />;
}
