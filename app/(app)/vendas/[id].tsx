import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { getNotaById, NotaFiscalRow } from '@/db/repositories/notas';
import { getDb } from '@/db/database';

interface ItemNota {
  cdProduto: number;
  dsProduto: string | null;
  qtProduto: number;
  vlUnitario: number;
  vlDesconto: number;
  vlAcrescimo: number;
  dsUnidade: string | null;
}

interface NotaParsed {
  cdNatureza: number | null;
  cdTipoVenda: number | null;
  vlTotalProdutos: number | null;
  vlDescontoTotal: number | null;
  vlAcrescimo: number | null;
  vlFrete: number | null;
  obs: string | null;
  idSituacao: string | null;
  itens: ItemNota[];
}

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

function num(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseNota(n: NotaFiscalRow): NotaParsed {
  let raw: any = {};
  try {
    raw = n.raw_json ? JSON.parse(n.raw_json) : {};
  } catch {}
  const itens: ItemNota[] = Array.isArray(raw?.notaFiscalSaidaItem)
    ? raw.notaFiscalSaidaItem.map((it: any) => ({
        cdProduto: Number(it.cdProduto),
        dsProduto: it.dsProduto ?? null,
        qtProduto: num(it.qtProduto),
        vlUnitario: num(it.vlUnitario),
        vlDesconto: num(it.vlDesconto),
        vlAcrescimo: num(it.vlAcrescimo),
        dsUnidade: it.dsUnidade ?? null,
      }))
    : [];
  return {
    cdNatureza: raw?.cdNatureza ?? null,
    cdTipoVenda: raw?.cdTipoVenda ?? null,
    vlTotalProdutos: raw?.vlTotalProdutos != null ? Number(raw.vlTotalProdutos) : null,
    vlDescontoTotal: raw?.vlDescontoTotal != null ? Number(raw.vlDescontoTotal) : null,
    vlAcrescimo: raw?.vlAcrescimo != null ? Number(raw.vlAcrescimo) : null,
    vlFrete: raw?.vlFrete != null ? Number(raw.vlFrete) : null,
    obs: raw?.obs ?? null,
    idSituacao: raw?.idSituacao ?? null,
    itens,
  };
}

export default function VendaDetalhe() {
  const params = useLocalSearchParams<{
    id: string;
    e: string;
    h: string;
  }>();
  const cdNota = Number(params.id);
  const cdEmpresa = Number(params.e);
  const holdingId = Number(params.h);

  const [nota, setNota] = useState<NotaFiscalRow | null>(null);
  const [parsed, setParsed] = useState<NotaParsed | null>(null);
  const [naturezaLabel, setNaturezaLabel] = useState<string | null>(null);
  const [tipoVendaLabel, setTipoVendaLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const n = await getNotaById(cdNota, cdEmpresa, holdingId);
      if (!n) {
        setLoading(false);
        return;
      }
      const p = parseNota(n);
      setNota(n);
      setParsed(p);

      const db = await getDb();
      if (p.cdNatureza != null) {
        const nat = await db.getFirstAsync<{ descricao: string }>(
          'SELECT descricao FROM natureza_operacao WHERE cd_natureza = ?',
          [p.cdNatureza],
        );
        setNaturezaLabel(nat?.descricao ?? null);
      }
      if (p.cdTipoVenda != null) {
        const tv = await db.getFirstAsync<{ descricao: string }>(
          'SELECT descricao FROM tipo_venda WHERE cd_tipo = ? AND holding_id = ?',
          [p.cdTipoVenda, holdingId],
        );
        setTipoVendaLabel(tv?.descricao ?? null);
      }
      setLoading(false);
    })();
  }, [cdNota, cdEmpresa, holdingId]);

  if (loading) return <ActivityIndicator style={{ marginTop: 24 }} />;
  if (!nota || !parsed) {
    return <Text style={{ padding: 16 }}>Venda não encontrada.</Text>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, gap: 14 }}>
      <View style={styles.card}>
        <Text style={styles.title}>NF nº {nota.cd_nota}</Text>
        <Text style={styles.subtle}>Emissão: {fmtDate(nota.dt_emissao)}</Text>
        <Text style={styles.totalValor}>{fmtMoney(nota.vl_total)}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Pagamento / Operação</Text>
        <Linha label="Tipo de venda" value={tipoVendaLabel ?? '—'} />
        <Linha label="Natureza de operação" value={naturezaLabel ?? '—'} />
        <Linha label="Situação" value={parsed.idSituacao ?? '—'} />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Valores</Text>
        <Linha label="Total dos produtos" value={fmtMoney(parsed.vlTotalProdutos)} />
        <Linha label="Desconto" value={fmtMoney(parsed.vlDescontoTotal)} />
        <Linha label="Acréscimo" value={fmtMoney(parsed.vlAcrescimo)} />
        <Linha label="Frete" value={fmtMoney(parsed.vlFrete)} />
        <Linha label="Total da nota" value={fmtMoney(nota.vl_total)} bold />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Itens ({parsed.itens.length})</Text>
        {parsed.itens.length === 0 ? (
          <Text style={styles.subtle}>Sem itens.</Text>
        ) : (
          parsed.itens.map((it, idx) => (
            <View key={`${it.cdProduto}-${idx}`} style={styles.itemRow}>
              <Text style={styles.itemDesc} numberOfLines={2}>
                {it.dsProduto ?? `Produto ${it.cdProduto}`}
              </Text>
              <Text style={styles.itemSub}>
                {it.qtProduto} {it.dsUnidade ?? 'un'} × {fmtMoney(it.vlUnitario)}
              </Text>
              <Text style={styles.itemTotal}>
                {fmtMoney(it.qtProduto * it.vlUnitario - it.vlDesconto + it.vlAcrescimo)}
              </Text>
            </View>
          ))
        )}
      </View>

      {parsed.obs ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Observação</Text>
          <Text style={styles.obs}>{parsed.obs}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function Linha({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.linha}>
      <Text style={styles.linhaLabel}>{label}</Text>
      <Text style={[styles.linhaValue, bold && { fontWeight: '800' }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  card: { backgroundColor: '#fff', padding: 14, borderRadius: 12, gap: 6 },
  title: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  subtle: { color: '#64748b', fontSize: 12 },
  totalValor: { color: '#16a34a', fontWeight: '800', fontSize: 22, marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  linha: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  linhaLabel: { color: '#64748b' },
  linhaValue: { color: '#0f172a', fontWeight: '600' },
  itemRow: { paddingVertical: 8, borderTopWidth: 1, borderColor: '#f1f5f9' },
  itemDesc: { color: '#0f172a', fontWeight: '600' },
  itemSub: { color: '#64748b', fontSize: 12, marginTop: 2 },
  itemTotal: { color: '#16a34a', fontWeight: '700', marginTop: 2 },
  obs: { color: '#475569' },
});
