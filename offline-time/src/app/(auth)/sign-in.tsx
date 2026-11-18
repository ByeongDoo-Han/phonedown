import { Ionicons } from '@expo/vector-icons';
import { Redirect } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { Card } from '@/components/Card';
import { Notice } from '@/components/Pill';
import { Screen } from '@/components/Screen';
import { AppleSignInButton } from '@/features/auth/AppleSignInButton';
import { useAuth } from '@/features/auth/AuthProvider';
import { getAuthRedirectUrl, OAuthDevelopmentBuildRequiredError, signInWithProvider } from '@/features/auth/socialSignIn';
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
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: getAuthRedirectUrl() },
        });
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
    catch (error) {
      setMessage(error instanceof OAuthDevelopmentBuildRequiredError
        ? error.message
        : 'Google 로그인을 마치지 못했습니다. 다시 시도해 주세요.');
    }
    finally { setBusy(false); }
  };

  return <Screen>
    <View style={styles.hero}>
      <View style={styles.mark}>
        <Ionicons name="moon" size={26} color={tokens.color.moon} />
        <View style={styles.markDot} />
      </View>
      <Text style={styles.eyebrow}>오프라인 타임</Text>
      <Text style={styles.title}>폰을 내려놓는 시간을{'\n'}포인트로 모아요</Text>
      <Text style={styles.subtitle}>수면과 집중 기록을 한곳에서 확인하고,{'\n'}주마다 정산해 교환하세요.</Text>
    </View>

    {!supabase ? <Notice tone="warning">
      서비스 연결이 아직 준비되지 않았습니다. Supabase 환경 설정을 확인해 주세요.
    </Notice> : null}

    <Card style={styles.form}>
      <View style={styles.field}>
        <Text style={styles.label}>이메일</Text>
        <TextInput accessibilityLabel="이메일" autoCapitalize="none" autoComplete="email"
          keyboardType="email-address" placeholder="name@example.com" placeholderTextColor={tokens.color.subtle}
          value={email} onChangeText={setEmail} style={styles.input} />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>비밀번호</Text>
        <TextInput accessibilityLabel="비밀번호" autoComplete="password" secureTextEntry
          placeholder="6자 이상" placeholderTextColor={tokens.color.subtle}
          value={password} onChangeText={setPassword} style={styles.input} />
      </View>
      <ActionButton label="이메일로 로그인" size="lg" disabled={busy || !supabase} loading={busy}
        onPress={() => { void run('signIn'); }} />
      <ActionButton label="이메일로 가입" variant="ghost" disabled={busy || !supabase}
        onPress={() => { void run('signUp'); }} />
    </Card>

    <View style={styles.dividerRow}>
      <View style={styles.divider} />
      <Text style={styles.dividerText}>또는</Text>
      <View style={styles.divider} />
    </View>

    <View style={styles.social}>
      <ActionButton label="Google로 계속하기" variant="secondary"
        icon={<Ionicons name="logo-google" size={18} color={tokens.color.inkSecondary} />}
        disabled={busy || !supabase} onPress={() => { void social(); }} />
      <AppleSignInButton disabled={busy || !supabase}
        onError={() => setMessage('Apple 로그인을 마치지 못했습니다. 다시 시도해 주세요.')} />
    </View>

    {message ? <Notice tone={message.includes('메일') ? 'accent' : 'danger'}>{message}</Notice> : null}

    <Text style={styles.footer}>기록은 서버 시각으로 정산되고, 포인트는 주 단위로 확정돼요.</Text>
  </Screen>;
}

const styles = StyleSheet.create({
  hero: { paddingTop: tokens.space.xl, paddingBottom: tokens.space.sm, gap: tokens.space.xs },
  mark: {
    width: 56, height: 56, borderRadius: 18, backgroundColor: tokens.color.night,
    alignItems: 'center', justifyContent: 'center', marginBottom: tokens.space.sm,
    ...tokens.shadow.card,
  },
  markDot: { position: 'absolute', width: 7, height: 7, borderRadius: 4, backgroundColor: tokens.color.moonStrong,
    top: 13, right: 14 },
  eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 1.4, color: tokens.color.accent },
  title: { fontSize: 30, lineHeight: 40, fontWeight: '800', letterSpacing: -0.8, color: tokens.color.ink },
  subtitle: { fontSize: 14, lineHeight: 21, color: tokens.color.muted, marginTop: 2 },
  form: { gap: tokens.space.sm },
  field: { gap: 6 },
  label: { fontSize: 12.5, fontWeight: '700', color: tokens.color.muted },
  input: {
    minHeight: 52, backgroundColor: tokens.color.surfaceMuted, borderWidth: 1,
    borderColor: tokens.color.line, borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.space.md, fontSize: 15.5, color: tokens.color.ink,
  },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.space.sm, marginVertical: tokens.space.xxs },
  divider: { flex: 1, height: 1, backgroundColor: tokens.color.line },
  dividerText: { fontSize: 12, fontWeight: '600', color: tokens.color.subtle },
  social: { gap: tokens.space.sm },
  footer: { fontSize: 12, lineHeight: 18, color: tokens.color.subtle, textAlign: 'center', marginTop: tokens.space.xs },
});
