import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/features/auth/AuthProvider';
import type { PrimaryMode, Profile } from '@/features/auth/useProfile';
import { supabase } from '@/lib/supabase';
import { tokens } from '@/theme/tokens';

const choices: { value: PrimaryMode; label: string }[] = [
  { value: 'sleep', label: '밤에 잘 때' },
  { value: 'focus', label: '낮에 일·공부할 때' },
  { value: 'both', label: '둘 다' },
];

export default function ModeOnboarding() {
  const { session } = useAuth();
  const [selected, setSelected] = useState<PrimaryMode | null>(null);
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: async (mode: PrimaryMode) => {
      if (!supabase || !session) throw new Error('인증 정보가 없습니다.');
      const { data, error } = await supabase.from('users').update({ primary_mode: mode, onboarded_at: new Date().toISOString() })
        .eq('id', session.user.id).select('primary_mode,onboarded_at').single();
      if (error) throw error;
      return data as Profile;
    },
    onSuccess: (profile) => {
      queryClient.setQueryData(['profile', session?.user.id], profile);
      router.replace('/(tabs)');
    },
  });

  if (!session) return <Redirect href="/(auth)/sign-in" />;

  return <Screen>
    <View style={styles.heading}>
      <Text style={styles.step}>시작하기</Text>
      <Text style={styles.title}>주로 언제 폰을 내려놓고 싶으세요?</Text>
      <Text style={styles.description}>선택한 시간에 맞춰 홈 화면을 준비합니다.</Text>
    </View>
    <View style={styles.options}>{choices.map(({ value, label }) => <Pressable key={value} accessibilityRole="radio"
      accessibilityState={{ selected: selected === value }} onPress={() => setSelected(value)}
      style={[styles.option, selected === value && styles.optionSelected]}>
      <Text style={[styles.optionLabel, selected === value && styles.optionLabelSelected]}>{label}</Text>
    </Pressable>)}</View>
    <View style={styles.info}><Text style={styles.infoTitle}>수면 기록 안내</Text>
      <Text style={styles.infoText}>수면은 충전 상태를 확인해 기록해요. 자기 전에 한 번, 아침에 한 번 누르면 서버가 정산합니다. 충전이 아니어도 기록할 수 있어요.</Text>
    </View>
    <View style={styles.spacer} />
    <ActionButton label="계속하기" disabled={!selected || save.isPending} onPress={() => { if (selected) save.mutate(selected); }} />
    {save.isError ? <Text style={styles.error}>선택을 저장하지 못했습니다. 다시 시도해 주세요.</Text> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  heading: { marginTop: 36, gap: 12 },
  step: { fontSize: 15, fontWeight: '700', color: tokens.color.accent },
  title: { fontSize: 28, lineHeight: 38, fontWeight: '800', color: tokens.color.ink },
  description: { fontSize: 15, color: tokens.color.muted },
  options: { gap: 12, marginTop: 20 },
  option: { borderRadius: tokens.radius.md, borderWidth: 1, borderColor: tokens.color.line,
    backgroundColor: tokens.color.surface, minHeight: 68, justifyContent: 'center', paddingHorizontal: 20 },
  optionSelected: { borderColor: tokens.color.accent, backgroundColor: tokens.color.accentSoft },
  optionLabel: { fontSize: 18, fontWeight: '600', color: tokens.color.ink },
  optionLabelSelected: { color: tokens.color.accent },
  info: { backgroundColor: tokens.color.surface, borderRadius: tokens.radius.md, padding: 18, gap: 6, marginTop: 8 },
  infoTitle: { fontSize: 15, fontWeight: '700', color: tokens.color.ink },
  infoText: { fontSize: 14, lineHeight: 21, color: tokens.color.muted },
  spacer: { flex: 1 },
  error: { color: tokens.color.danger },
});
