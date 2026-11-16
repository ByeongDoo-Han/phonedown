import { Redirect } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { Screen } from '@/components/Screen';
import { AppleSignInButton } from '@/features/auth/AppleSignInButton';
import { useAuth } from '@/features/auth/AuthProvider';
import { signInWithProvider } from '@/features/auth/socialSignIn';
import { supabase } from '@/lib/supabase';
import { tokens } from '@/theme/tokens';

export default function SignIn() {
  const { session } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  if (session) return <Redirect href="/" />;

  const run = async (action: 'signIn' | 'signUp') => {
    if (!supabase) return;
    if (!email.trim() || password.length < 6) {
      setMessage('이메일과 6자 이상 비밀번호를 입력해 주세요.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      if (action === 'signIn') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        if (!data.session) setMessage('확인 메일을 보냈습니다. 메일에서 가입을 완료해 주세요.');
      }
    } catch {
      setMessage('로그인 정보를 확인하고 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  const social = async () => {
    setBusy(true);
    setMessage('');
    try { await signInWithProvider('google'); }
    catch { setMessage('Google 로그인을 마치지 못했습니다. 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  };

  return <Screen>
    <View style={styles.heading}>
      <Text style={styles.eyebrow}>오프라인 타임</Text>
      <Text style={styles.title}>폰을 내려놓는 시간을 모아요</Text>
      <Text style={styles.subtitle}>수면과 집중 기록을 한곳에서 확인하세요.</Text>
    </View>
    {!supabase ? <View style={styles.notice}><Text style={styles.noticeText}>서비스 연결이 아직 준비되지 않았습니다. Supabase 환경 설정을 확인해 주세요.</Text></View> : null}
    <View style={styles.form}>
      <TextInput accessibilityLabel="이메일" autoCapitalize="none" autoComplete="email" keyboardType="email-address"
        placeholder="이메일" value={email} onChangeText={setEmail} style={styles.input} />
      <TextInput accessibilityLabel="비밀번호" autoComplete="password" secureTextEntry
        placeholder="비밀번호" value={password} onChangeText={setPassword} style={styles.input} />
      <ActionButton label="이메일로 로그인" disabled={busy || !supabase} onPress={() => { void run('signIn'); }} />
      <ActionButton label="이메일로 가입" secondary disabled={busy || !supabase} onPress={() => { void run('signUp'); }} />
      <Text style={styles.separator}>또는</Text>
      <ActionButton label="Google로 계속하기" secondary disabled={busy || !supabase} onPress={() => { void social(); }} />
      <AppleSignInButton disabled={busy || !supabase} onError={() => setMessage('Apple 로그인을 마치지 못했습니다. 다시 시도해 주세요.')} />
    </View>
    {message ? <Text accessibilityRole="alert" style={styles.message}>{message}</Text> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  heading: { marginTop: 48, marginBottom: 24, gap: 10 },
  eyebrow: { color: tokens.color.accent, fontSize: 16, fontWeight: '700' },
  title: { color: tokens.color.ink, fontSize: 30, fontWeight: '800', lineHeight: 40 },
  subtitle: { color: tokens.color.muted, fontSize: 15, lineHeight: 23 },
  notice: { padding: 16, backgroundColor: tokens.color.accentSoft, borderRadius: tokens.radius.md },
  noticeText: { color: tokens.color.ink, lineHeight: 21 },
  form: { gap: 12 },
  input: { minHeight: 52, backgroundColor: tokens.color.surface, borderWidth: 1, borderColor: tokens.color.line,
    borderRadius: tokens.radius.md, paddingHorizontal: 16, fontSize: 16, color: tokens.color.ink },
  separator: { alignSelf: 'center', color: tokens.color.muted, marginVertical: 4 },
  message: { color: tokens.color.danger, fontSize: 14, lineHeight: 21 },
});
