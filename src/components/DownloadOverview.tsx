import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSyncStore } from '@/stores/sync';
import { DOWNLOAD_STAGES } from '@/sync/entities';
import { downloadPercent } from '@/sync/downloadProgress';

const STATUS = {
  idle: 'Aguardando',
  running: 'Importando',
  done: 'Concluído',
  error: 'Falhou',
} as const;

export function DownloadOverview() {
  const {
    entities,
    downloadProgress: progress,
    downloadRunning: running,
    downloadFinishedAt: finished,
    downloadError: error,
  } = useSyncStore();
  const completed = DOWNLOAD_STAGES.filter(
    ({ key }) => entities[key]?.status === 'done',
  ).length;
  const percent = finished && !error ? 100 : downloadPercent(progress);
  const count =
    progress && progress.total > 0
      ? `${progress.done.toLocaleString('pt-BR')} de ${progress.total.toLocaleString('pt-BR')}`
      : running
        ? 'Consultando quantidade…'
        : ' ';

  return (
    <View style={styles.container}>
      <View style={styles.summary} testID="download-summary">
        <View style={styles.heading}>
          <Text style={styles.title}>Progresso da importação</Text>
          <Text style={styles.percent}>{percent}%</Text>
        </View>
        <View
          style={styles.track}
          accessibilityRole="progressbar"
          accessibilityLabel="Progresso da importação"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <View style={[styles.fill, { width: `${percent}%` }]} />
        </View>
        <Text style={styles.status}>
          {completed} de {DOWNLOAD_STAGES.length} etapas concluídas
        </Text>
        <Text
          style={styles.current}
          numberOfLines={2}
          accessibilityLiveRegion="polite"
        >
          {error
            ? 'Importação não concluída'
            : finished
              ? 'Importação concluída'
              : (progress?.label ?? 'Aguardando início')}
        </Text>
        <Text style={styles.count} numberOfLines={1}>
          {count}
        </Text>
      </View>
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        testID="download-stages"
      >
        {DOWNLOAD_STAGES.map(({ key, label }) => {
          const entity = entities[key];
          const status = entity?.status ?? 'idle';
          const quantity =
            entity && (entity.total > 0 || entity.downloaded > 0)
              ? ` · ${entity.downloaded.toLocaleString('pt-BR')} / ${entity.total.toLocaleString('pt-BR')}`
              : '';
          return (
            <View
              key={key}
              style={[styles.row, status === 'running' && styles.active]}
              testID={`download-stage-${key}`}
            >
              <View style={styles.rowContent}>
                <Text style={styles.label}>{label}</Text>
                <Text style={styles.detail} numberOfLines={1}>
                  {STATUS[status]}
                  {quantity}
                </Text>
              </View>
              <View style={styles.icon}>
                {status === 'running' ? (
                  <ActivityIndicator color="#1e3a8a" />
                ) : (
                  <Ionicons
                    name={
                      status === 'done'
                        ? 'checkmark-circle'
                        : status === 'error'
                          ? 'alert-circle'
                          : 'ellipse-outline'
                    }
                    size={22}
                    color={
                      status === 'done'
                        ? '#16a34a'
                        : status === 'error'
                          ? '#b45309'
                          : '#94a3b8'
                    }
                  />
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 0 },
  summary: {
    backgroundColor: '#fff',
    padding: 16,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  heading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  title: { color: '#0f172a', fontWeight: '700', fontSize: 16, flex: 1 },
  percent: {
    color: '#1e3a8a',
    fontSize: 20,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    minWidth: 55,
    textAlign: 'right',
  },
  track: {
    height: 8,
    backgroundColor: '#dbeafe',
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: '#1e3a8a', borderRadius: 4 },
  status: { color: '#64748b', fontSize: 13, lineHeight: 20 },
  current: {
    color: '#334155',
    fontWeight: '600',
    fontSize: 15,
    lineHeight: 20,
    minHeight: 40,
  },
  count: {
    color: '#64748b',
    fontSize: 13,
    lineHeight: 20,
    minHeight: 20,
    fontVariant: ['tabular-nums'],
  },
  list: { flex: 1 },
  listContent: { padding: 16, paddingBottom: 32 },
  row: {
    backgroundColor: '#fff',
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  active: { backgroundColor: '#eff6ff' },
  rowContent: { flex: 1, gap: 5 },
  label: { color: '#334155', fontWeight: '600', fontSize: 14 },
  detail: {
    color: '#64748b',
    fontSize: 13,
    lineHeight: 20,
    fontVariant: ['tabular-nums'],
  },
  icon: { width: 30, alignItems: 'flex-end' },
});
