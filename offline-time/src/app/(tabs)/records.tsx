import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { tokens } from '@/theme/tokens';

export default function Records() {
  return <Screen>
    <Text style={styles.title}>기록</Text>
    <View style={styles.card}>
      <Text style={styles.heading}>한 주의 리듬</Text>
      <Text style={styles.body}>기록이 쌓이면 수면과 집중 시간을 이곳에서 확인할 수 있어요.</Text>
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  title: { fontSize: 30, fontWeight: '800', color: tokens.color.ink, marginTop: 20 },
  card: { backgroundColor: tokens.color.surface, borderRadius: tokens.radius.lg, padding: 24, gap: 12 },
  heading: { fontSize: 20, fontWeight: '700', color: tokens.color.ink },
  body: { fontSize: 15, lineHeight: 23, color: tokens.color.muted },
});
