import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/features/auth/AuthProvider';
import type { PrimaryMode, Profile } from '@/features/auth/useProfile';
import { supabase } from '@/lib/supabase';
import { tokens } from '@/theme/tokens';

type IconName = ComponentProps<typeof Ionicons>['name'];

const choices: { value: PrimaryMode; label: string; description: string; icon: IconName }[] = [
  { value: 'sleep', label: '밤에 잘 때', description: '잠든 시간을 기록하고 아침에 정산해요', icon: 'moon' },
  { value: 'focus', label: '낮에 일·공부할 때', description: '30·60·90분 집중 타이머로 기록해요', icon: 'flash' },
  { value: 'both', label: '둘 다', description: '시간대에 맞춰 홈 카드를 바꿔 보여드려요', icon: 'contrast' },
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
    <View style={styles.progressRow}>
      <View style={[styles.progressDot, styles.progressDotDone]} />
      <View style={[styles.progressDot, styles.progressDotActive]} />
    </View>

    <View style={styles.heading}>
      <Text style={styles.step}>1분이면 끝나요</Text>
      <Text style={styles.title}>주로 언제 폰을{'\n'}내려놓고 싶으세요?</Text>
      <Text style={styles.description}>선택한 시간에 맞춰 홈 화면을 준비합니다.</Text>
    </View>

    <View style={styles.options}>
      {choices.map(({ value, label, description, icon }) => {
        const active = selected === value;
        return <Pressable key={value} accessibilityRole="radio"
          accessibilityState={{ selected: active }} onPress={() => setSelected(value)}
          style={({ pressed }) => [styles.option, active && styles.optionSelected, pressed && styles.pressed]}>
          <View style={[styles.optionIcon, active && styles.optionIconSelected]}>
            <Ionicons name={icon} size={20} color={active ? tokens.color.accent : tokens.color.muted} />
          </View>
          <View style={styles.optionText}>
            <Text style={[styles.optionLabel, active && styles.optionLabelSelected]}>{label}</Text>
            <Text style={styles.optionDescription}>{description}</Text>
          </View>
          <View style={[styles.check, active && styles.checkSelected]}>
            {active ? <Ionicons name="checkmark" size={14} color={tokens.color.onAccent} /> : null}
          </View>
        </Pressable>;
      })}
    </View>

    <Card tone="soft" style={styles.info}>
      <View style={styles.infoHead}>
        <Ionicons name="battery-charging-outline" size={18} color={tokens.color.accent} />
        <Text style={styles.infoTitle}>수면 기록 안내</Text>
      </View>
      <Text style={styles.infoText}>자기 전에 한 번, 아침에 한 번 누르면 서버가 정산합니다.
        충전 상태는 근거로만 남고, 충전이 아니어도 기록할 수 있어요.</Text>
    </Card>

    <View style={styles.spacer} />
    <ActionButton label="계속하기" size="lg" disabled={!selected || save.isPending}
      loading={save.isPending} onPress={() => { if (selected) save.mutate(selected); }} />
    {save.isError ? <Text style={styles.error}>선택을 저장하지 못했습니다. 다시 시도해 주세요.</Text> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  progressRow: { flexDirection: 'row', gap: 6, paddingTop: tokens.space.sm },
  progressDot: { height: 4, flex: 1, borderRadius: 2, backgroundColor: tokens.color.line },
  progressDotDone: { backgroundColor: tokens.color.accentLine },
  progressDotActive: { backgroundColor: tokens.color.accent },
  heading: { marginTop: tokens.space.xl, gap: tokens.space.xs },
  step: { fontSize: 12, fontWeight: '800', letterSpacing: 1.2, color: tokens.color.accent },
  title: { fontSize: 30, lineHeight: 40, fontWeight: '800', letterSpacing: -0.8, color: tokens.color.ink },
  description: { fontSize: 14, lineHeight: 21, color: tokens.color.muted },
  options: { gap: tokens.space.sm, marginTop: tokens.space.xs },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.space.sm,
    backgroundColor: tokens.color.surface, borderWidth: 1, borderColor: tokens.color.line,
    borderRadius: tokens.radius.lg, padding: tokens.space.md, minHeight: 78,
    ...tokens.shadow.soft,
  },
  optionSelected: { borderColor: tokens.color.accent, backgroundColor: tokens.color.accentSoft },
  pressed: { opacity: 0.85 },
  optionIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: tokens.color.surfaceMuted },
  optionIconSelected: { backgroundColor: tokens.color.surface },
  optionText: { flex: 1, gap: 2 },
  optionLabel: { fontSize: 16.5, fontWeight: '700', color: tokens.color.ink, letterSpacing: -0.2 },
  optionLabelSelected: { color: tokens.color.accentStrong },
  optionDescription: { fontSize: 12.5, lineHeight: 18, color: tokens.color.muted },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: tokens.color.lineStrong,
    alignItems: 'center', justifyContent: 'center' },
  checkSelected: { backgroundColor: tokens.color.accent, borderColor: tokens.color.accent },
  info: { gap: tokens.space.xs, marginTop: tokens.space.xs },
  infoHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoTitle: { fontSize: 14, fontWeight: '800', color: tokens.color.ink },
  infoText: { fontSize: 13, lineHeight: 20, color: tokens.color.muted },
  spacer: { flex: 1, minHeight: tokens.space.lg },
  error: { fontSize: 13, color: tokens.color.danger, textAlign: 'center' },
});
