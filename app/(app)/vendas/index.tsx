import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { DateInput } from '@/components/DateInput';
import { listNotasFiltradas, NotaListagemRow } from '@/db/repositories/notas';
import { useSessionStore } from '@/stores/session';
import { dateToBr, fmtDate, fmtMoney, parseBrDateToIso, todayBr } from '@/utils/format';

type PeriodoRapido = 'hoje' | '7d' | '30d';

function periodoParaDatas(tipo: PeriodoRapido): { inicio: string; fim: string } {
  const fim = new Date();
  const inicio = new Date();
  if (tipo === '7d') inicio.setDate(inicio.getDate() - 6);
  if (tipo === '30d') inicio.setDate(inicio.getDate() - 29);
  return { inicio: dateToBr(inicio), fim: dateToBr(fim) };
}

export default function VendasScreen() {
  const router = useRouter();
  const holdingId = useSessionStore((s) => s.user?.holdingId);

  const [dtInicio, setDtInicio] = useState(todayBr());
  const [dtFim, setDtFim] = useState(todayBr());
  const [clienteSearch, setClienteSearch] = useState('');
  const [nrNota, setNrNota] = useState('');
  const [items, setItems] = useState<NotaListagemRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [buscou, setBuscou] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  function aplicarPeriodo(tipo: PeriodoRapido) {
    const { inicio, fim } = periodoParaDatas(tipo);
    setDtInicio(inicio);
    setDtFim(fim);
    setAviso(null);
  }

  const buscar = useCallback(async () => {
    const nr = nrNota.trim() ? Number(nrNota.trim()) : undefined;
    const temNr = nr != null && Number.isFinite(nr);

    if (!temNr) {
      const isoIni = parseBrDateToIso(dtInicio);
      const isoFim = parseBrDateToIso(dtFim);
      if (!isoIni || !isoFim) {
        setAviso('Informe o período de datas válido.');
        setItems([]);
        setBuscou(true);
        return;
      }
    }

    setLoading(true);
    setAviso(null);
    setBuscou(true);

    const isoIni = parseBrDateToIso(dtInicio);
    const isoFim = parseBrDateToIso(dtFim);

    const rows = await listNotasFiltradas({
      nrNota: temNr ? nr : undefined,
      dtInicio: temNr ? undefined : isoIni ?? undefined,
      dtFim: temNr ? undefined : isoFim ?? undefined,
      clienteSearch: clienteSearch.trim() || undefined,
      holdingId: holdingId ?? undefined,
    });

    setItems(rows);
    setLoading(false);
  }, [clienteSearch, dtFim, dtInicio, holdingId, nrNota]);

  const fimDate = parseBrDateToIso(dtFim)
    ? new Date(parseBrDateToIso(dtFim)! + 'T12:00:00')
    : undefined;

  return (
    <View style={styles.container}>
      <View style={styles.filters}>
        <Text style={styles.periodoTitulo}>Período de emissão</Text>
        <View style={styles.periodoChips}>
          {(
            [
              { id: 'hoje' as const, label: 'Hoje' },
              { id: '7d' as const, label: '7 dias' },
              { id: '30d' as const, label: '30 dias' },
            ] as const
          ).map((p) => (
            <Pressable
              key={p.id}
              style={styles.periodoChip}
              onPress={() => aplicarPeriodo(p.id)}
            >
              <Text style={styles.periodoChipText}>{p.label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.filterRow}>
          <DateInput
            label="Data inicial"
            value={dtInicio}
            onChange={setDtInicio}
            maximumDate={fimDate}
          />
          <DateInput
            label="Data final"
            value={dtFim}
            onChange={setDtFim}
            minimumDate={
              parseBrDateToIso(dtInicio)
                ? new Date(parseBrDateToIso(dtInicio)! + 'T12:00:00')
                : undefined
            }
          />
        </View>
        <TextInput
          style={styles.input}
          placeholder="Cliente (nome)"
          placeholderTextColor="#94a3b8"
          value={clienteSearch}
          onChangeText={setClienteSearch}
        />
        <TextInput
          style={styles.input}
          placeholder="Nr. nota (filtro master)"
          placeholderTextColor="#94a3b8"
          value={nrNota}
          onChangeText={setNrNota}
          keyboardType="numeric"
        />
        <Pressable style={styles.buscarBtn} onPress={buscar}>
          <Ionicons name="search" size={18} color="#fff" />
          <Text style={styles.buscarBtnText}>Buscar</Text>
        </Pressable>
        {aviso ? <Text style={styles.aviso}>{aviso}</Text> : null}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={items}
          style={{ flex: 1 }}
          keyExtractor={(it) => `${it.cd_nota}-${it.cd_empresa}-${it.holding_id}`}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {buscou
                ? 'Nenhuma nota encontrada.'
                : 'Informe o período e clique em Buscar.'}
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() =>
                router.push({
                  pathname: '/(app)/vendas/[id]',
                  params: {
                    id: String(item.cd_nota),
                    e: String(item.cd_empresa),
                    h: String(item.holding_id),
                  },
                })
              }
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>
                  NF {item.cd_nota}
                  {item.serie ? ` / Série ${item.serie}` : ''}
                </Text>
                <Text style={styles.sub}>
                  {item.cliente_nome ?? `Cliente #${item.cd_cliente}`} •{' '}
                  {fmtDate(item.dt_emissao)}
                </Text>
                {item.condicao_pagto ? (
                  <Text style={styles.sub}>{item.condicao_pagto}</Text>
                ) : null}
              </View>
              <Text style={styles.value}>{fmtMoney(item.vl_total)}</Text>
              <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  filters: {
    padding: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  periodoTitulo: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  periodoChips: { flexDirection: 'row', gap: 8 },
  periodoChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#e0e7ff',
  },
  periodoChipText: { color: '#1e3a8a', fontSize: 12, fontWeight: '700' },
  filterRow: { flexDirection: 'row', gap: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    backgroundColor: '#ffffff',
    color: '#0f172a',
  },
  buscarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1e3a8a',
    paddingVertical: 12,
    borderRadius: 8,
  },
  buscarBtnText: { color: '#fff', fontWeight: '700' },
  aviso: { color: '#dc2626', fontSize: 12, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    padding: 14,
    gap: 12,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  rowPressed: { backgroundColor: '#f1f5f9' },
  sep: { height: 1, backgroundColor: '#e2e8f0' },
  name: { fontWeight: '700', color: '#0f172a' },
  sub: { color: '#64748b', fontSize: 12, marginTop: 2 },
  value: { color: '#16a34a', fontWeight: '700' },
  empty: { textAlign: 'center', marginTop: 32, color: '#64748b', paddingHorizontal: 16 },
});
