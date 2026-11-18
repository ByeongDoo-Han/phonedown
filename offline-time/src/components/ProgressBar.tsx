import { StyleSheet, Text, View } from 'react-native';

import { tokens } from '@/theme/tokens';

export function percentOf(value: number, cap: number): number {
  if (cap <= 0) return 0;
  return Math.min(100, Math.max(0, (value / cap) * 100));
}

// A single progress rail with an optional label row above it. The track is always drawn so an
// empty week still reads as "0 of 100", not as a missing element.
export function ProgressBar({ value, cap, color = tokens.color.accent, trackColor, height = 8, night = false }: {
  value: number;
  cap: number;
  color?: string;
  trackColor?: string;
  height?: number;
  night?: boolean;
}) {
  const percent = percentOf(value, cap);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: cap, now: Math.min(value, cap) }}
      style={[styles.track, { height, borderRadius: height / 2 },
        { backgroundColor: trackColor ?? (night ? tokens.color.nightLine : tokens.color.surfaceSunken) }]}
    >
      <View style={[styles.fill, { width: `${percent}%`, backgroundColor: color, borderRadius: height / 2 }]} />
    </View>
  );
}

export function LabeledBar({ label, value, cap, color, suffix, night = false }: {
  label: string;
  value: number;
  cap: number;
  color: string;
  suffix?: string;
  night?: boolean;
}) {
  return (
    <View style={styles.labelled}>
      <View style={styles.row}>
        <Text style={[styles.label, night && styles.labelNight]}>{label}</Text>
        <Text style={[styles.value, night && styles.valueNight]}>
          {value}{suffix ?? ''}<Text style={[styles.cap, night && styles.capNight]}> / {cap}{suffix ?? ''}</Text>
        </Text>
      </View>
      <ProgressBar value={value} cap={cap} color={color} night={night} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { width: '100%', overflow: 'hidden' },
  fill: { height: '100%' },
  labelled: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  label: { fontSize: 13, fontWeight: '600', color: tokens.color.muted },
  labelNight: { color: tokens.color.nightMuted },
  value: { fontSize: 13, fontWeight: '700', color: tokens.color.ink, fontVariant: ['tabular-nums'] },
  valueNight: { color: tokens.color.nightInk },
  cap: { fontWeight: '500', color: tokens.color.subtle },
  capNight: { color: tokens.color.nightSubtle },
});
