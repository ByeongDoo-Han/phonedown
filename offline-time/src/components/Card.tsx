import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { tokens } from '@/theme/tokens';

export type CardTone = 'light' | 'soft' | 'accent' | 'night' | 'nightSoft';

const tones: Record<CardTone, { background: string; border: string }> = {
  light: { background: tokens.color.surface, border: tokens.color.line },
  soft: { background: tokens.color.surfaceMuted, border: 'transparent' },
  accent: { background: tokens.color.accentSoft, border: tokens.color.accentLine },
  night: { background: tokens.color.night, border: tokens.color.nightLine },
  nightSoft: { background: tokens.color.nightRaised, border: tokens.color.nightLine },
};

export function Card({ children, tone = 'light', style }: {
  children: ReactNode;
  tone?: CardTone;
  style?: StyleProp<ViewStyle>;
}) {
  const surface = tones[tone];
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: surface.background, borderColor: surface.border },
        tone === 'night' ? tokens.shadow.lift : tokens.shadow.card,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SectionHeader({ title, caption, right, night = false }: {
  title: string;
  caption?: string;
  right?: ReactNode;
  night?: boolean;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionText}>
        <Text style={[styles.sectionTitle, night && styles.sectionTitleNight]}>{title}</Text>
        {caption ? <Text style={[styles.sectionCaption, night && styles.sectionCaptionNight]}>{caption}</Text> : null}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: tokens.radius.lg, borderWidth: 1, padding: tokens.space.lg, gap: tokens.space.sm },
  section: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: tokens.space.sm, marginTop: tokens.space.xs },
  sectionText: { flex: 1, gap: 2 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: tokens.color.ink, letterSpacing: -0.3 },
  sectionTitleNight: { color: tokens.color.nightInk },
  sectionCaption: { fontSize: 13, color: tokens.color.muted, lineHeight: 19 },
  sectionCaptionNight: { color: tokens.color.nightMuted },
});
