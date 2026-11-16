import { ActionButton } from '@/components/ActionButton';
import { signInWithProvider } from '@/features/auth/socialSignIn';

export function AppleSignInButton({ disabled, onError }: { disabled: boolean; onError: () => void }) {
  return <ActionButton label="Apple로 계속하기" disabled={disabled} secondary onPress={() => {
    signInWithProvider('apple').catch(onError);
  }} />;
}
