import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { tokens } from '@/theme/tokens';

export default function Store() {
  return <Screen>
    <Text style={styles.title}>교환소</Text>
    <View style={styles.card}>
      <Text style={styles.heading}>교환 가능한 포인트</Text>
      <Text style={styles.body}>포인트가 확정되면 이곳에서 교환 상품을 볼 수 있어요.</Text>
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  title: { fontSize: 30, fontWeight: '800', color: tokens.color.ink, marginTop: 20 },
  card: { backgroundColor: tokens.color.surface, borderRadius: tokens.radius.lg, padding: 24, gap: 12 },
  heading: { fontSize: 20, fontWeight: '700', color: tokens.color.ink },
  body: { fontSize: 15, lineHeight: 23, color: tokens.color.muted },
});
