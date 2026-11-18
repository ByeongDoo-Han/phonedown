import type { ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { tokens } from '@/theme/tokens';

// The page shell: a light canvas and one scrolling column. Screens that belong to the night
// pass `night` so the canvas turns midnight instead of white.
export function Screen({ children, night = false }: { children: ReactNode; night?: boolean }) {
  return (
    <SafeAreaView style={[styles.safe, night && styles.safeNight]} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: tokens.color.background },
  safeNight: { backgroundColor: tokens.color.night },
  content: {
    flexGrow: 1,
    paddingHorizontal: tokens.space.lg,
    paddingTop: tokens.space.md,
    paddingBottom: tokens.space.xxl,
    gap: tokens.space.md,
  },
});
