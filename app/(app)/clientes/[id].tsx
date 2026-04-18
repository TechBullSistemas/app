import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { ClienteRow, getClienteById } from '@/db/repositories/clientes';
import {
  listNotasByCliente,
  listTitulosByCliente,
  NotaFiscalRow,
  TituloRow,
} from '@/db/repositories/notas';
import { listVisitasCliente, VisitaRow } from '@/db/repositories/visitas';

function fmtMoney(v: number | null | undefined) {
  if (v == null) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(v: string | null | undefined) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleDateString('pt-BR');
  } catch {
    return v;
  }
}

export default function ClienteDetalhe() {
  const params = useLocalSearchParams<{ id: string; h: string }>();
  const cdCliente = Number(params.id);
  const holdingId = Number(params.h);

  const [cli, setCli] = useState<ClienteRow | null>(null);
  const [notas, setNotas] = useState<NotaFiscalRow[]>([]);
  const [titulos, setTitulos] = useState<TituloRow[]>([]);
  const [visitas, setVisitas] = useState<VisitaRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [c, n, t, v] = await Promise.all([
        getClienteById(cdCliente, holdingId),
        listNotasByCliente(cdCliente, holdingId),
        listTitulosByCliente(cdCliente, holdingId),
        listVisitasCliente(cdCliente, holdingId),
      ]);
      setCli(c ?? null);
      setNotas(n);
      setTitulos(t);
      setVisitas(v);
      setLoading(false);
    })();
  }, [cdCliente, holdingId]);

  if (loading) return <ActivityIndicator style={{ marginTop: 24 }} />;
  if (!cli) return <Text style={{ padding: 16 }}>Cliente não encontrado.</Text>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, gap: 16 }}>
      <View style={styles.card}>
        <Text style={styles.title}>{cli.nome}</Text>
        {cli.razao_social ? <Text style={styles.subtle}>{cli.razao_social}</Text> : null}
        <Text style={styles.subtle}>CPF/CNPJ: {cli.cpf_cnpj || '—'}</Text>
        <Text style={styles.subtle}>Telefone: {cli.fone || '—'}</Text>
        <Text style={styles.subtle}>Celular: {cli.celular || '—'}</Text>
        <Text style={styles.subtle}>E-mail: {cli.email || '—'}</Text>
        <Text style={styles.subtle}>
          {cli.endereco || ''} {cli.numero || ''} - {cli.bairro || ''}
        </Text>
      </View>

      <Section title={`Vendas (${notas.length})`}>
        {notas.length === 0 ? (
          <Text style={styles.subtle}>Sem vendas registradas.</Text>
        ) : (
          notas.slice(0, 30).map((n) => (
            <View key={`${n.cd_nota}-${n.cd_empresa}`} style={styles.line}>
              <Text style={styles.lineMain}>NF {n.cd_nota}</Text>
              <Text style={styles.lineSub}>
                {fmtDate(n.dt_emissao)} • {fmtMoney(n.vl_total)}
              </Text>
            </View>
          ))
        )}
      </Section>

      <Section title={`Títulos a Receber (${titulos.length})`}>
        {titulos.length === 0 ? (
          <Text style={styles.subtle}>Nenhum título em aberto.</Text>
        ) : (
          titulos.map((t) => (
            <View key={`${t.cd_titulo}-${t.cd_empresa}`} style={styles.line}>
              <Text style={styles.lineMain}>Título {t.cd_titulo}</Text>
              <Text style={styles.lineSub}>
                Venc.: {fmtDate(t.dt_vencimento)} • {fmtMoney(t.vl_titulo)}
                {t.vl_pago ? ` • Pago ${fmtMoney(t.vl_pago)}` : ''}
              </Text>
            </View>
          ))
        )}
      </Section>

      <Section title={`Visitas (${visitas.length})`}>
        {visitas.length === 0 ? (
          <Text style={styles.subtle}>Nenhuma visita registrada.</Text>
        ) : (
          visitas.map((v, i) => (
            <View key={`${v.cd_visita ?? 'l'}-${i}`} style={styles.line}>
              <Text style={styles.lineMain}>
                {fmtDate(v.dt_visita)} {v.id_comprou ? '• Comprou' : '• Não comprou'}
              </Text>
              {v.motivo_nao_comprou ? (
                <Text style={styles.lineSub}>Motivo: {v.motivo_nao_comprou}</Text>
              ) : null}
              {v.observacao ? <Text style={styles.lineSub}>{v.observacao}</Text> : null}
            </View>
          ))
        )}
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  card: { backgroundColor: '#fff', padding: 14, borderRadius: 12, gap: 4 },
  title: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  subtle: { color: '#475569', fontSize: 13 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8, color: '#0f172a' },
  line: { paddingVertical: 6, borderBottomWidth: 1, borderColor: '#f1f5f9' },
  lineMain: { color: '#0f172a', fontWeight: '600' },
  lineSub: { color: '#64748b', fontSize: 12 },
});
