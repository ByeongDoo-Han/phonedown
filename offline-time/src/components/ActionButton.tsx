import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { tokens } from '@/theme/tokens';

export type ActionVariant = 'primary' | 'secondary' | 'ghost' | 'soft' | 'night' | 'moon';

const surfaces: Record<ActionVariant, { background: string; border: string; text: string }> = {
  primary: { background: tokens.color.accent, border: tokens.color.accent, text: tokens.color.onAccent },
  secondary: { background: tokens.color.surface, border: tokens.color.lineStrong, text: tokens.color.ink },
  ghost: { background: 'transparent', border: 'transparent', text: tokens.color.muted },
  soft: { background: tokens.color.accentSoft, border: tokens.color.accentSoft, text: tokens.color.accentStrong },
  night: { background: tokens.color.nightInk, border: tokens.color.nightInk, text: tokens.color.night },
  moon: { background: tokens.color.moon, border: tokens.color.moon, text: tokens.color.night },
};

export function ActionButton({
  label,
  onPress,
  disabled = false,
  variant = 'primary',
  icon,
  loading = false,
  size = 'md',
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: ActionVariant;
  icon?: ReactNode;
  loading?: boolean;
  size?: 'md' | 'lg';
  accessibilityHint?: string;
}) {
  const surface = surfaces[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        size === 'lg' && styles.large,
        { backgroundColor: surface.background, borderColor: surface.border },
        pressed && !inactive && styles.pressed,
        inactive && styles.disabled,
      ]}
    >
      {loading
        ? <ActivityIndicator color={surface.text} size="small" />
        : <View style={styles.inner}>
          {icon}
          <Text style={[styles.text, size === 'lg' && styles.largeText, { color: surface.text }]}>
            {label}
          </Text>
        </View>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.space.md,
  },
  large: { minHeight: 58, borderRadius: tokens.radius.lg },
  inner: { flexDirection: 'row', alignItems: 'center', gap: tokens.space.xs },
  text: { fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  largeText: { fontSize: 17 },
  pressed: { opacity: 0.86 },
  disabled: { opacity: 0.45 },
});
