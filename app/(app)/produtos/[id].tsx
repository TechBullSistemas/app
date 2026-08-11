import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { getProdutoById, getProdutoAuxiliarLabels, fmtCodigoDescricao, ProdutoRow } from '@/db/repositories/produtos';
import { getCdTabelasPermitidas } from '@/db/repositories/usuarioTabelaPreco';
import {
  listTabelaPrecoItensByProduto,
  TabelaPrecoItemComDescricao,
} from '@/db/repositories/tabelaPrecoItem';
import { useSessionStore } from '@/stores/session';
import { fmtDate, fmtMoney } from '@/utils/format';

const TIPO_PRODUTO_LABEL: Record<string, string> = {
  P: 'Físico',
  S: 'Serviço',
};

function getFatorVenda(item: ProdutoRow): number {
  if (item.fator_venda != null && Number.isFinite(item.fator_venda) && item.fator_venda >= 0) {
    return item.fator_venda;
  }
  try {
    const raw = item.raw_json ? JSON.parse(item.raw_json) : {};
    const f = Number(raw.fatorVenda);
    return Number.isFinite(f) && f >= 0 ? f : 0;
  } catch {
    return 0;
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Linha({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.linha}>
      <Text style={styles.linhaLabel}>{label}</Text>
      <Text style={styles.linhaValue}>{value}</Text>
    </View>
  );
}

export default function ProdutoDetalhe() {
  const params = useLocalSearchParams<{ id: string; h: string }>();
  const cdProduto = Number(params.id);
  const holdingId = Number(params.h);
  const user = useSessionStore((s) => s.user);
  const [item, setItem] = useState<ProdutoRow | null>(null);
  const [tabelas, setTabelas] = useState<TabelaPrecoItemComDescricao[]>([]);
  const [auxLabels, setAuxLabels] = useState<Awaited<ReturnType<typeof getProdutoAuxiliarLabels>> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const r = await getProdutoById(cdProduto, holdingId);
      const cdTabelas = await getCdTabelasPermitidas(user?.userId, holdingId);
      const [tabs, labels] = await Promise.all([
        listTabelaPrecoItensByProduto(cdProduto, holdingId, cdTabelas),
        r ? getProdutoAuxiliarLabels(r) : Promise.resolve(null),
      ]);
      setItem(r ?? null);
      setTabelas(tabs);
      setAuxLabels(labels);
      setLoading(false);
    })();
  }, [cdProduto, holdingId, user?.userId]);

  if (loading) return <ActivityIndicator style={{ marginTop: 24 }} />;
  if (!item) return <Text style={{ padding: 16 }}>Produto não encontrado.</Text>;

  const photo = item.foto_local || item.foto_url || null;
  const fatorVenda = getFatorVenda(item);
  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, gap: 14 }}>
      {photo ? (
        <Image source={{ uri: photo }} style={styles.image} resizeMode="contain" />
      ) : null}

      <View style={styles.card}>
        <Text style={styles.code}>#{item.cd_produto}</Text>
        <Text style={styles.title}>{item.descricao}</Text>
        <Text style={styles.subtle}>Ref.: {item.referencia || '—'}</Text>
      </View>

      <Section title="Informações gerais">
        <Linha label="Fator de venda" value={String(fatorVenda)} />
        <Linha label="Estoque disponível" value={String(item.qt_disponivel ?? 0)} />
        {item.cd_unidade != null ? (
          <Linha
            label="Unidade"
            value={fmtCodigoDescricao(item.cd_unidade, auxLabels?.unidade)}
          />
        ) : null}
        {item.cd_marca != null ? (
          <Linha
            label="Marca"
            value={fmtCodigoDescricao(item.cd_marca, auxLabels?.marca)}
          />
        ) : null}
        {item.cd_grupo != null ? (
          <Linha
            label="Grupo"
            value={fmtCodigoDescricao(item.cd_grupo, auxLabels?.grupo)}
          />
        ) : null}
        {item.cd_fornecedor != null ? (
          <Linha
            label="Fornecedor"
            value={fmtCodigoDescricao(item.cd_fornecedor, auxLabels?.fornecedor)}
          />
        ) : null}
        {item.cd_cor != null ? (
          <Linha label="Cor" value={fmtCodigoDescricao(item.cd_cor, auxLabels?.cor)} />
        ) : null}
        {item.cd_tamanho != null ? (
          <Linha
            label="Tamanho"
            value={fmtCodigoDescricao(item.cd_tamanho, auxLabels?.tamanho)}
          />
        ) : null}
        {item.id_tipo_produto ? (
          <Linha
            label="Tipo"
            value={
              TIPO_PRODUTO_LABEL[item.id_tipo_produto] ?? item.id_tipo_produto
            }
          />
        ) : null}
      </Section>

      <Section title="Preço padrão">
        <Linha label="Venda" value={fmtMoney(item.vl_venda)} />
        {item.vl_atacado != null && item.vl_atacado > 0 ? (
          <Linha label="Atacado" value={fmtMoney(item.vl_atacado)} />
        ) : null}
        {item.vl_promocao != null && item.vl_promocao > 0 ? (
          <Linha label="Promoção" value={fmtMoney(item.vl_promocao)} />
        ) : null}
      </Section>

      <Section title={`Tabelas de preço (${tabelas.length})`}>
        {tabelas.length === 0 ? (
          <Text style={styles.subtle}>Nenhuma tabela de preço encontrada.</Text>
        ) : (
          tabelas.map((t) => {
            const vigencia =
              t.dt_promocao_inicio || t.dt_promocao_fim
                ? `${fmtDate(t.dt_promocao_inicio)} — ${fmtDate(t.dt_promocao_fim)}`
                : null;
            const partes = [
              t.vl_venda > 0 ? `Venda ${fmtMoney(t.vl_venda)}` : null,
              t.vl_venda_atacado > 0 ? `Atacado ${fmtMoney(t.vl_venda_atacado)}` : null,
              t.vl_promocao > 0 ? `Promo ${fmtMoney(t.vl_promocao)}` : null,
              t.vl_promocao_aprazo > 0 ? `Promo prazo ${fmtMoney(t.vl_promocao_aprazo)}` : null,
            ].filter(Boolean);

            return (
              <View
                key={`${t.cd_tabela_preco}-${t.cd_produto}`}
                style={styles.tabelaRow}
              >
                <Text style={styles.tabelaNome}>
                  {t.tabela_descricao ?? `Tabela ${t.cd_tabela_preco}`} (#{t.cd_tabela_preco})
                </Text>
                {partes.length > 0 ? (
                  <Text style={styles.subtle}>{partes.join(' • ')}</Text>
                ) : null}
                {vigencia ? <Text style={styles.subtle}>Vigência: {vigencia}</Text> : null}
              </View>
            );
          })
        )}
      </Section>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  image: { width: '100%', height: 280, backgroundColor: '#fff', borderRadius: 12 },
  card: { backgroundColor: '#fff', padding: 16, borderRadius: 12, gap: 4 },
  code: { color: '#1e3a8a', fontSize: 12, fontWeight: '700' },
  title: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  subtle: { color: '#475569', fontSize: 12, marginTop: 2 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  linha: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  linhaLabel: { color: '#64748b' },
  linhaValue: { color: '#0f172a', fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  tabelaRow: { paddingVertical: 8, borderTopWidth: 1, borderColor: '#f1f5f9', gap: 2 },
  tabelaNome: { color: '#0f172a', fontWeight: '700', fontSize: 13 },
});
