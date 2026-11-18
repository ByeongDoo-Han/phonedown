import { Pressable, StyleSheet, Text } from 'react-native';

import { tokens } from '@/theme/tokens';

// A chosen-value pill (mode, preset, clock). Selection is carried by fill, not only by text
// colour, so the choice is visible at a glance and to anyone who cannot tell the two apart.
export function Chip({ label, selected, onPress, night = false, size = 'md' }: {
  label: string;
  selected: boolean;
  onPress: () => void;
  night?: boolean;
  size?: 'md' | 'lg';
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        size === 'lg' && styles.large,
        night ? styles.nightChip : styles.dayChip,
        selected && (night ? styles.nightSelected : styles.daySelected),
        pressed && styles.pressed,
      ]}
    >
      <Text style={[
        styles.text,
        size === 'lg' && styles.largeText,
        night ? styles.nightText : styles.dayText,
        selected && (night ? styles.nightTextSelected : styles.dayTextSelected),
      ]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 44,
    minWidth: 64,
    paddingHorizontal: tokens.space.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
  },
  large: { minHeight: 52, minWidth: 84 },
  dayChip: { backgroundColor: tokens.color.surface, borderColor: tokens.color.line },
  daySelected: { backgroundColor: tokens.color.accent, borderColor: tokens.color.accent },
  dayText: { color: tokens.color.inkSecondary, fontSize: 15, fontWeight: '700' },
  dayTextSelected: { color: tokens.color.onAccent },
  nightChip: { backgroundColor: tokens.color.moonSoft, borderColor: tokens.color.moonLine },
  nightSelected: { backgroundColor: tokens.color.moon, borderColor: tokens.color.moon },
  nightText: { color: tokens.color.nightInk, fontSize: 15, fontWeight: '700' },
  nightTextSelected: { color: tokens.color.night },
  text: { fontVariant: ['tabular-nums'] },
  largeText: { fontSize: 16 },
  pressed: { opacity: 0.8 },
});
