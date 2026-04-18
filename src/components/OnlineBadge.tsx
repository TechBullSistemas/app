import { useOnlineStore } from '@/stores/online';
import { StyleSheet, Text, View } from 'react-native';

export function OnlineBadge() {
  const isOnline = useOnlineStore((s) => s.isOnline);
  return (
    <View style={[styles.badge, { backgroundColor: isOnline ? '#16a34a' : '#dc2626' }]}>
      <View style={styles.dot} />
      <Text style={styles.text}>{isOnline ? 'Online' : 'Offline'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    gap: 6,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  text: { color: '#fff', fontWeight: '700', fontSize: 12 },
});
