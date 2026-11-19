import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { legalDocument, type LegalDocId } from '@/features/legal/legalText';
import { tokens } from '@/theme/tokens';

// 로그인 화면과 설정에서 바로 여는 약관·정책 화면. 별도 웹 페이지에 기대지 않고 앱 안에서
// 전문을 읽을 수 있게 한다(스토어 심사 요건). 문구는 src/features/legal/legalText.ts 한 곳에 있다.

const docOf = (value: string | string[] | undefined): LegalDocId =>
  value === 'privacy' ? 'privacy' : 'terms';

export default function Legal() {
  const params = useLocalSearchParams<{ doc?: string }>();
  const document = legalDocument(docOf(params.doc));

  return <Screen>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="뒤로"
        onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/'); }}
        style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
        <Ionicons name="chevron-back" size={22} color={tokens.color.ink} />
      </Pressable>
      <Text style={styles.headerTitle}>{document.title}</Text>
      <View style={styles.iconSpacer} />
    </View>

    <Card style={styles.introCard}>
      <Text style={styles.docTitle}>{document.title}</Text>
      <Text style={styles.updatedAt}>최종 수정 {document.updatedAt}</Text>
      <Text style={styles.intro}>{document.intro}</Text>
    </Card>

    {document.sections.map((section) => <View key={section.title} style={styles.section}>
      <Text style={styles.sectionTitle}>{section.title}</Text>
      {section.body.map((line) => <Text key={line} style={styles.body}>{line}</Text>)}
    </View>)}

    <Text style={styles.footer}>{document.footer}</Text>
  </Screen>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: tokens.space.xs },
  headerTitle: { fontSize: 17, fontWeight: '800', color: tokens.color.ink },
  iconButton: { width: 38, height: 38, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: tokens.color.surface, borderWidth: 1, borderColor: tokens.color.line },
  iconSpacer: { width: 38 },
  pressed: { opacity: 0.7 },
  introCard: { gap: tokens.space.xxs },
  docTitle: { fontSize: 22, fontWeight: '800', color: tokens.color.ink, letterSpacing: -0.4 },
  updatedAt: { fontSize: 12, fontWeight: '600', color: tokens.color.subtle },
  intro: { fontSize: 13.5, lineHeight: 21, color: tokens.color.muted, marginTop: 2 },
  section: { gap: 6 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: tokens.color.ink, letterSpacing: -0.2 },
  body: { fontSize: 13.5, lineHeight: 21, color: tokens.color.inkSecondary },
  footer: { fontSize: 12, color: tokens.color.subtle, marginTop: tokens.space.xs },
});
