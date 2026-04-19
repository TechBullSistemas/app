import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { SpeedometerGauge } from '@/components/SpeedometerGauge';
import { listMetas, MetaProgresso } from '@/api/meta';
import { useSessionStore } from '@/stores/session';
import { extractApiErrorMessage } from '@/api/client';

function fmtMoney(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtNum(v: number) {
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

function fmtDate(s: string) {
  try {
    return new Date(s).toLocaleDateString('pt-BR');
  } catch {
    return s;
  }
}

function formatValor(v: number, idTipo: string) {
  if (idTipo === 'V') return fmtMoney(v);
  return `${fmtNum(v)} pç`;
}

function periodoLabel(tp: string) {
  switch (tp) {
    case 'D':
      return 'Diária';
    case 'S':
      return 'Semanal';
    case 'Q':
      return 'Quinzenal';
    case 'M':
      return 'Mensal';
    case 'A':
      return 'Anual';
    default:
      return tp;
  }
}

export default function MetaScreen() {
  const user = useSessionStore((s) => s.user);
  const [metas, setMetas] = useState<MetaProgresso[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const result = await listMetas(user?.cdEmpresa);
      setMetas(result);
    } catch (err) {
      setError(extractApiErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.cdEmpresa]);

  useEffect(() => {
    load();
  }, [load]);

  function onRefresh() {
    setRefreshing(true);
    load();
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1e3a8a" />
        <Text style={styles.loadingText}>Carregando metas...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, gap: 16 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {error ? (
        <View style={styles.errorBox}>
          <Ionicons name="warning" size={20} color="#dc2626" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {!error && metas.length === 0 ? (
        <View style={styles.emptyBox}>
          <Ionicons name="flag-outline" size={36} color="#94a3b8" />
          <Text style={styles.emptyTitle}>Nenhuma meta ativa</Text>
          <Text style={styles.emptyText}>
            Não há metas vigentes para você no momento.
          </Text>
        </View>
      ) : null}

      {metas.map((m) => (
        <View key={m.cdMeta} style={styles.card}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.metaTitle}>{m.dsMeta}</Text>
              <Text style={styles.metaSub}>
                {periodoLabel(m.tpPeriodo)} • {fmtDate(m.dtInicio)} até{' '}
                {fmtDate(m.dtFim)}
              </Text>
            </View>
            {m.cdVendedor ? (
              <View style={[styles.tag, { backgroundColor: '#dbeafe' }]}>
                <Text style={[styles.tagText, { color: '#1d4ed8' }]}>
                  Individual
                </Text>
              </View>
            ) : (
              <View style={[styles.tag, { backgroundColor: '#fef3c7' }]}>
                <Text style={[styles.tagText, { color: '#a16207' }]}>
                  Geral
                </Text>
              </View>
            )}
          </View>

          <View style={styles.gaugeWrap}>
            <SpeedometerGauge
              value={m.percentual}
              size={280}
              label={m.idTipo === 'V' ? 'Atingido (R$)' : 'Atingido (peças)'}
              formattedValue={formatValor(m.valorAtual, m.idTipo)}
              formattedTarget={formatValor(m.vlMeta, m.idTipo)}
            />
          </View>

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Meta</Text>
              <Text style={styles.statValue}>
                {formatValor(m.vlMeta, m.idTipo)}
              </Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Atingido</Text>
              <Text style={[styles.statValue, { color: '#16a34a' }]}>
                {formatValor(m.valorAtual, m.idTipo)}
              </Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Falta</Text>
              <Text
                style={[
                  styles.statValue,
                  {
                    color:
                      m.valorAtual >= m.vlMeta ? '#16a34a' : '#dc2626',
                  },
                ]}
              >
                {formatValor(
                  Math.max(0, m.vlMeta - m.valorAtual),
                  m.idTipo,
                )}
              </Text>
            </View>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  center: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: { color: '#64748b' },
  errorBox: {
    flexDirection: 'row',
    backgroundColor: '#fee2e2',
    padding: 12,
    borderRadius: 10,
    gap: 8,
    alignItems: 'center',
  },
  errorText: { color: '#7f1d1d', flex: 1 },
  emptyBox: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  emptyText: { color: '#64748b', textAlign: 'center' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    gap: 12,
    elevation: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  metaTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  metaSub: { color: '#64748b', fontSize: 12, marginTop: 2 },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  tagText: { fontSize: 11, fontWeight: '700' },
  gaugeWrap: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  statsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 12,
    gap: 8,
  },
  stat: { flex: 1, alignItems: 'center' },
  statLabel: { color: '#64748b', fontSize: 11, fontWeight: '600' },
  statValue: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
});
