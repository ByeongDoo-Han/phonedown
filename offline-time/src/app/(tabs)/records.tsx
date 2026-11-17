import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/features/auth/AuthProvider';
import { listSessions, sessionQueryKey, type TimeSession } from '@/features/session/sessionApi';
import { tokens } from '@/theme/tokens';

function formatDate(value: string) {
  return new Date(value).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function formatDuration(session: TimeSession) {
  if (!session.server_ended_at) return '진행 중';
  const minutes = Math.floor((Date.parse(session.server_ended_at) - Date.parse(session.server_started_at)) / 60_000);
  if (minutes < 60) return `${Math.max(0, minutes)}분`;
  return `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;
}

function statusText(session: TimeSession) {
  if (session.status === 'open') return '진행 중';
  if (session.status === 'valid') return '기록 완료';
  if (session.invalid_reason === 'too_short') return '20분 미만';
  if (session.invalid_reason === 'clock_skew') return '기기 시간 확인 필요';
  return '유효하지 않은 기록';
}

export default function Records() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const sessions = useQuery({
    queryKey: sessionQueryKey(userId),
    enabled: !!userId,
    queryFn: () => listSessions(userId!),
  });

  return <Screen>
    <Text style={styles.title}>기록</Text>
    <Text style={styles.subtitle}>최근 오프라인 시간을 확인하세요.</Text>
    {sessions.isPending ? <ActivityIndicator color={tokens.color.accent} /> : null}
    {sessions.isError ? <View style={styles.card}>
      <Text style={styles.body}>기록을 불러오지 못했습니다.</Text>
      <ActionButton label="다시 불러오기" secondary onPress={() => { void sessions.refetch(); }} />
    </View> : null}
    {sessions.data?.length === 0 ? <View style={styles.card}>
      <Text style={styles.heading}>아직 기록이 없어요</Text>
      <Text style={styles.body}>홈에서 집중 시간을 시작해 보세요.</Text>
    </View> : null}
    {sessions.data?.map((item) => <View key={item.id} style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.heading}>{item.mode === 'focus' ? '집중' : '수면'}</Text>
        <Text style={[styles.status, item.status === 'invalid' && styles.invalid]}>{statusText(item)}</Text>
      </View>
      <Text style={styles.duration}>{formatDuration(item)}</Text>
      <Text style={styles.body}>{formatDate(item.server_started_at)} 시작</Text>
    </View>)}
  </Screen>;
}

const styles = StyleSheet.create({
  title: { fontSize: 30, fontWeight: '800', color: tokens.color.ink, marginTop: 20 },
  subtitle: { color: tokens.color.muted, fontSize: 15 },
  card: { backgroundColor: tokens.color.surface, borderRadius: tokens.radius.lg, padding: 24, gap: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heading: { fontSize: 20, fontWeight: '700', color: tokens.color.ink },
  status: { color: tokens.color.accent, fontSize: 14, fontWeight: '700' },
  invalid: { color: tokens.color.danger },
  duration: { color: tokens.color.ink, fontSize: 28, fontWeight: '800' },
  body: { fontSize: 15, lineHeight: 23, color: tokens.color.muted },
});
