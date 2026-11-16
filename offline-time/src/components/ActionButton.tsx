import { Pressable, StyleSheet, Text } from 'react-native';

import { tokens } from '@/theme/tokens';

export function ActionButton({ label, onPress, disabled = false, secondary = false }: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
      style={[styles.button, secondary ? styles.secondary : styles.primary, disabled && styles.disabled]}>
      <Text style={[styles.text, secondary ? styles.secondaryText : styles.primaryText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 52, borderRadius: tokens.radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primary: { backgroundColor: tokens.color.accent },
  secondary: { backgroundColor: tokens.color.surface, borderColor: tokens.color.line, borderWidth: 1 },
  disabled: { opacity: 0.5 },
  text: { fontSize: 16, fontWeight: '700' },
  primaryText: { color: '#FFFFFF' },
  secondaryText: { color: tokens.color.ink },
});
