import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { tokens } from '@/theme/tokens';

export type PillTone = 'neutral' | 'accent' | 'indigo' | 'lavender' | 'moon' | 'success' | 'danger' | 'warning';

const tones: Record<PillTone, { background: string; text: string }> = {
  neutral: { background: tokens.color.surfaceMuted, text: tokens.color.muted },
  accent: { background: tokens.color.accentSoft, text: tokens.color.accentStrong },
  indigo: { background: tokens.color.indigoSoft, text: tokens.color.indigo },
  // Lavender reads on a white card; `moon` is the same family for dark night surfaces.
  lavender: { background: '#EFF0FE', text: '#4B46A8' },
  moon: { background: tokens.color.moonSoft, text: tokens.color.moon },
  success: { background: tokens.color.successSoft, text: tokens.color.success },
  danger: { background: tokens.color.dangerSoft, text: tokens.color.danger },
  warning: { background: tokens.color.warningSoft, text: tokens.color.warning },
};

export function Pill({ label, tone = 'neutral', icon }: { label: string; tone?: PillTone; icon?: ReactNode }) {
  const surface = tones[tone];
  return (
    <View style={[styles.pill, { backgroundColor: surface.background }]}>
      {icon}
      <Text style={[styles.text, { color: surface.text }]}>{label}</Text>
    </View>
  );
}

// A tinted inline message. `danger` is used for errors so they are never mistaken for a
// success note that happens to sit in the same place.
export function Notice({ children, tone = 'accent', night = false }: {
  children: ReactNode;
  tone?: 'accent' | 'danger' | 'warning' | 'moon';
  night?: boolean;
}) {
  const surface = tone === 'danger'
    ? { background: tokens.color.dangerSoft, text: tokens.color.danger, border: '#FCD9D5' }
    : tone === 'warning'
      ? { background: tokens.color.warningSoft, text: tokens.color.warning, border: '#FDE7BF' }
      : tone === 'moon'
        ? { background: tokens.color.moonSoft, text: tokens.color.moon, border: tokens.color.moonLine }
        : { background: tokens.color.accentSoft, text: tokens.color.accentStrong, border: tokens.color.accentLine };
  return (
    <View accessibilityRole="alert" style={[styles.notice, { backgroundColor: surface.background, borderColor: surface.border }]}>
      <View style={[styles.dot, { backgroundColor: surface.text }]} />
      <Text style={[styles.noticeText, { color: night && tone === 'moon' ? tokens.color.moon : surface.text }]}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 12, fontWeight: '700' },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
  },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  noticeText: { flex: 1, fontSize: 13.5, lineHeight: 20, fontWeight: '500' },
});
