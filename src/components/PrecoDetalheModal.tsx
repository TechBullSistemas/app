import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
  initialWindowMetrics,
} from 'react-native-safe-area-context';
import type { PrecoTrace, ResultadoCalculoItem } from '@/services/pricing';

interface Props {
  visible: boolean;
  onClose: () => void;
  produto: { cdProduto: number; descricao: string };
  qt: number;
  vlUnitarioAtual: number;
  vlUnitarioOriginal: number;
  pricing?: ResultadoCalculoItem | null;
  cdTabelaPreco?: number | null;
  tabelaPrecoDesc?: string | null;
  vlMinimo?: number | null;
}

function fmtMoney(v: number | null | undefined) {
  if (v == null) return '—';
  return Number(v).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function fmtPerc(v: number | null | undefined) {
  if (v == null) return '—';
  return `${Number(v).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  })}%`;
}

function origemLabel(t: PrecoTrace['origem']) {
  switch (t) {
    case 'tabela':
      return 'Tabela de preço (vl_venda)';
    case 'promocao':
      return 'Tabela de promoção (vl_promocao)';
    case 'ultima-venda':
      return 'Última venda (vl_valor da condição)';
    case 'formula':
      return 'Fórmula dinâmica da empresa';
    case 'manual':
      return 'Preço digitado pelo vendedor';
    default:
      return '—';
  }
}

/**
 * Mostra o passo a passo do cálculo do preço unitário, incluindo a origem
 * de cada componente (tabela, condição de preço, condição de pagamento,
 * faixa de desconto, fórmula). Útil para o vendedor diagnosticar valores
 * que parecem fora do esperado.
 */
export function PrecoDetalheModal({
  visible,
  onClose,
  produto,
  qt,
  vlUnitarioAtual,
  vlUnitarioOriginal,
  pricing,
  cdTabelaPreco,
  tabelaPrecoDesc,
  vlMinimo,
}: Props) {
  const trace = pricing?.trace ?? null;
  const editadoManual = vlUnitarioAtual !== vlUnitarioOriginal;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <Text style={styles.title}>Detalhes do preço</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.close}>Fechar</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                {produto.descricao} ({produto.cdProduto})
              </Text>
              <View style={styles.kvRow}>
                <Text style={styles.k}>Quantidade</Text>
                <Text style={styles.v}>{qt}</Text>
              </View>
              <View style={styles.kvRow}>
                <Text style={styles.k}>Tabela de preço</Text>
                <Text style={styles.v}>
                  {cdTabelaPreco != null
                    ? `#${cdTabelaPreco}${tabelaPrecoDesc ? ` • ${tabelaPrecoDesc}` : ''}`
                    : '—'}
                </Text>
              </View>
              <View style={styles.kvRow}>
                <Text style={styles.k}>Preço atual</Text>
                <Text style={[styles.v, styles.vBold]}>
                  {fmtMoney(vlUnitarioAtual)}
                </Text>
              </View>
              {editadoManual && (
                <View style={styles.kvRow}>
                  <Text style={styles.k}>Preço calculado pelo motor</Text>
                  <Text style={styles.v}>{fmtMoney(vlUnitarioOriginal)}</Text>
                </View>
              )}
              {vlMinimo != null && (
                <View style={styles.kvRow}>
                  <Text style={styles.k}>Mínimo permitido</Text>
                  <Text style={styles.v}>{fmtMoney(vlMinimo)}</Text>
                </View>
              )}
            </View>

            {trace ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Pipeline de cálculo</Text>

                <Text style={styles.sectionTitle}>1. Preço base</Text>
                <View style={styles.kvRow}>
                  <Text style={styles.k}>vl_venda da tabela</Text>
                  <Text style={styles.v}>{fmtMoney(trace.vlVendaTabela)}</Text>
                </View>
                {trace.vlPromocaoTabela > 0 && (
                  <View style={styles.kvRow}>
                    <Text style={styles.k}>
                      vl_promocao{trace.promocaoValida ? ' (vigente)' : ' (fora da janela)'}
                    </Text>
                    <Text style={styles.v}>
                      {fmtMoney(trace.vlPromocaoTabela)}
                    </Text>
                  </View>
                )}
                <View style={styles.kvRow}>
                  <Text style={styles.k}>Origem da base</Text>
                  <Text style={styles.v}>{origemLabel(trace.origem)}</Text>
                </View>
                <View style={styles.kvRow}>
                  <Text style={styles.k}>Base resultante</Text>
                  <Text style={styles.v}>{fmtMoney(trace.vlBase)}</Text>
                </View>

                <Text style={styles.sectionTitle}>
                  2. Acréscimo da condição de preço
                </Text>
                <View style={styles.kvRow}>
                  <Text style={styles.k}>Condição</Text>
                  <Text style={styles.v}>
                    {trace.cdCondicaoPreco != null
                      ? `#${trace.cdCondicaoPreco}`
                      : '— (nenhuma)'}
                  </Text>
                </View>
                <View style={styles.kvRow}>
                  <Text style={styles.k}>% acréscimo</Text>
                  <Text style={styles.v}>{fmtPerc(trace.prAcrescimoCondicao)}</Text>
                </View>
                <View style={styles.kvRow}>
                  <Text style={styles.k}>Após acréscimo</Text>
                  <Text style={styles.v}>
                    {fmtMoney(trace.vlAposAcrescimoCondicao)}
                  </Text>
                </View>

                <Text style={styles.sectionTitle}>
                  3. Condição de pagamento
                </Text>
                <View style={styles.kvRow}>
                  <Text style={styles.k}>Cond. pagto.</Text>
                  <Text style={styles.v}>
                    {trace.cdCondicaoPagto != null
                      ? `#${trace.cdCondicaoPagto}`
                      : '—'}
                  </Text>
                </View>
                <View style={styles.kvRow}>
                  <Text style={styles.k}>% desconto (subtrai)</Text>
                  <Text style={styles.v}>
                    {fmtPerc(trace.prDescontoCondicaoPagto)}
                  </Text>
                </View>
                <View style={styles.kvRow}>
                  <Text style={styles.k}>% acréscimo (link cond. preço)</Text>
                  <Text style={styles.v}>
                    {fmtPerc(trace.prAcrescimoCondicaoPagto)}
                  </Text>
                </View>
                <View style={styles.kvRow}>
                  <Text style={styles.k}>Após cond. pagto.</Text>
                  <Text style={styles.v}>
                    {fmtMoney(trace.vlAposAcrescimoCondicaoPagto)}
                  </Text>
                </View>

                <Text style={styles.sectionTitle}>
                  4. Desconto por faixa de quantidade
                </Text>
                <View style={styles.kvRow}>
                  <Text style={styles.k}>% desconto faixa</Text>
                  <Text style={styles.v}>{fmtPerc(trace.prDescontoFaixa)}</Text>
                </View>
                <View style={styles.kvRow}>
                  <Text style={styles.k}>Vl. desconto</Text>
                  <Text style={styles.v}>{fmtMoney(trace.vlDescontoFaixa)}</Text>
                </View>
                <View style={styles.kvRow}>
                  <Text style={styles.k}>Após desconto</Text>
                  <Text style={styles.v}>
                    {fmtMoney(trace.vlAposDescontoFaixa)}
                  </Text>
                </View>

                <Text style={styles.sectionTitle}>
                  Tributos de saída (origem dos v_pr_*_saida)
                </Text>
                <View style={styles.kvRow}>
                  <Text style={styles.k}>UF empresa → UF cliente</Text>
                  <Text style={styles.v}>
                    {trace.ufEmpresa ?? '—'} → {trace.ufCliente ?? '—'}
                  </Text>
                </View>
                <View style={styles.kvRow}>
                  <Text style={styles.k}>imposto_uf encontrado</Text>
                  <Text style={styles.v}>
                    {trace.impostoUfEncontrado ? 'Sim' : 'Não — sem cadastro'}
                  </Text>
                </View>
                {trace.prIcmsTabelaIcms != null && (
                  <View style={styles.kvRow}>
                    <Text style={styles.k}>tabela_icms (origem×destino)</Text>
                    <Text style={styles.v}>
                      {fmtPerc(trace.prIcmsTabelaIcms)}
                    </Text>
                  </View>
                )}
                <View style={styles.kvRow}>
                  <Text style={styles.k}>v_pr_pis_saida</Text>
                  <Text style={styles.v}>
                    {fmtPerc(trace.prPisSaida)} ({trace.prPisSaidaOrigem})
                  </Text>
                </View>
                <View style={styles.kvRow}>
                  <Text style={styles.k}>v_pr_cofins_saida</Text>
                  <Text style={styles.v}>
                    {fmtPerc(trace.prCofinsSaida)} ({trace.prCofinsSaidaOrigem})
                  </Text>
                </View>
                <View style={styles.kvRow}>
                  <Text style={styles.k}>v_pr_icms_saida</Text>
                  <Text style={styles.v}>
                    {fmtPerc(trace.prIcmsSaida)} ({trace.prIcmsSaidaOrigem})
                  </Text>
                </View>
                {trace.tpClienteVenda != null && (
                  <View style={styles.kvRow}>
                    <Text style={styles.k}>Tipo de cliente (venda)</Text>
                    <Text style={styles.v}>
                      {trace.tpClienteVenda === 'C'
                        ? 'C — Consumo'
                        : trace.tpClienteVenda === 'I'
                        ? 'I — Indústria'
                        : trace.tpClienteVenda === 'R'
                        ? 'R — Revenda'
                        : trace.tpClienteVenda}
                    </Text>
                  </View>
                )}
                {trace.prIcmsInternoEscolhido != null && (
                  <View style={styles.kvRow}>
                    <Text style={styles.k}>ICMS interno escolhido</Text>
                    <Text style={styles.v}>
                      {fmtPerc(trace.prIcmsInternoEscolhido)}
                      {trace.fonteIcmsInterno
                        ? ` (fonte: ${
                            trace.fonteIcmsInterno === 'C'
                              ? 'Consumo'
                              : trace.fonteIcmsInterno === 'R'
                              ? 'Revenda'
                              : 'Indústria'
                          })`
                        : ''}
                    </Text>
                  </View>
                )}
                {trace.impostoUfEncontrado && (
                  <View style={styles.kvRow}>
                    <Text style={styles.k}>Alíquotas internas (UF)</Text>
                    <Text style={styles.v}>
                      C {fmtPerc(trace.prIcmsInternoConsumo ?? 0)} • R{' '}
                      {fmtPerc(trace.prIcmsInternoRevenda ?? 0)} • I{' '}
                      {fmtPerc(trace.prIcmsInternoIndustria ?? 0)}
                    </Text>
                  </View>
                )}
                {trace.prIcmsSaidaOrigem === 'zero' && (
                  <Text style={styles.aviso}>
                    ⚠ ICMS de saída zerado. Verifique se o produto tem
                    cd_imposto, se imposto_uf existe para a UF da empresa e se
                    a UF do cliente foi resolvida.
                  </Text>
                )}

                {trace.formulaExpr ? (
                  <>
                    <Text style={styles.sectionTitle}>5. Fórmula dinâmica</Text>
                    <View style={styles.kvRow}>
                      <Text style={styles.k}>Status</Text>
                      <Text style={styles.v}>
                        {trace.formulaAplicada
                          ? 'Aplicada (sobrepôs preço)'
                          : trace.formulaErro
                            ? 'Inválida — usou preço padrão'
                            : 'Não aplicada (gate fechou)'}
                      </Text>
                    </View>
                    {!trace.formulaAplicada && trace.formulaGateMotivo && (
                      <Text style={styles.aviso}>
                        Motivo: {trace.formulaGateMotivo}
                      </Text>
                    )}
                    <Text style={styles.subTitle}>Expressão</Text>
                    <View style={styles.codeBox}>
                      <Text style={styles.codeText} selectable>
                        {trace.formulaExpr}
                      </Text>
                    </View>
                    {trace.formulaVars && (
                      <>
                        <Text style={styles.subTitle}>
                          Variáveis usadas (do contexto)
                        </Text>
                        <View style={styles.varsBox}>
                          {Object.entries(trace.formulaVars)
                            .sort(([a], [b]) => a.localeCompare(b))
                            .map(([k, v]) => (
                              <View key={k} style={styles.kvRow}>
                                <Text style={styles.kMono}>{k}</Text>
                                <Text style={styles.vMono}>
                                  {typeof v === 'number' && Number.isFinite(v)
                                    ? v.toLocaleString('pt-BR', {
                                        minimumFractionDigits: 0,
                                        // 8 casas: custos contábeis/aquisição
                                        // são armazenados com essa precisão e
                                        // entram inteiros no cálculo.
                                        maximumFractionDigits: 8,
                                      })
                                    : String(v)}
                                </Text>
                              </View>
                            ))}
                        </View>
                      </>
                    )}
                    {trace.vlAposFormula != null && (
                      <View style={styles.kvRow}>
                        <Text style={styles.k}>Resultado da fórmula</Text>
                        <Text style={styles.v}>
                          {fmtMoney(trace.vlAposFormula)}
                        </Text>
                      </View>
                    )}
                    {trace.formulaErro && (
                      <Text style={styles.aviso}>⚠ {trace.formulaErro}</Text>
                    )}
                  </>
                ) : null}

                <Text style={styles.sectionTitle}>
                  6. Arredondamento ({trace.decimais} casas)
                </Text>
                <View style={styles.kvRow}>
                  <Text style={styles.k}>Preço final</Text>
                  <Text style={[styles.v, styles.vBold]}>
                    {fmtMoney(trace.vlUnitarioFinal)}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.card}>
                <Text style={styles.empty}>
                  Pipeline indisponível — preço definido manualmente ou motor
                  ainda não recalculou este item.
                </Text>
              </View>
            )}

            {pricing && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Impostos e flex (estimativa)</Text>
                <View style={styles.kvRow}>
                  <Text style={styles.k}>IPI</Text>
                  <Text style={styles.v}>{fmtMoney(pricing.vlIpi)}</Text>
                </View>
                <View style={styles.kvRow}>
                  <Text style={styles.k}>ICMS</Text>
                  <Text style={styles.v}>
                    {fmtMoney(pricing.vlIcms)} ({fmtPerc(pricing.prIcmsAplicado)})
                  </Text>
                </View>
                <View style={styles.kvRow}>
                  <Text style={styles.k}>ST</Text>
                  <Text style={styles.v}>{fmtMoney(pricing.vlSt)}</Text>
                </View>
                <View style={styles.kvRow}>
                  <Text style={styles.k}>Comissão</Text>
                  <Text style={styles.v}>
                    {fmtMoney(pricing.vlComissao)} ({fmtPerc(pricing.prComissao)})
                  </Text>
                </View>
                <View style={styles.kvRow}>
                  <Text style={styles.k}>Flex no item</Text>
                  <Text style={styles.v}>{fmtMoney(pricing.vlFlex)}</Text>
                </View>
                {pricing.avisos?.length > 0 && (
                  <View style={{ marginTop: 8 }}>
                    {pricing.avisos.map((a, i) => (
                      <Text key={i} style={styles.aviso}>
                        ⚠ {a}
                      </Text>
                    ))}
                  </View>
                )}
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#1e3a8a',
  },
  title: { color: '#fff', fontWeight: '700', fontSize: 16 },
  close: { color: '#fff', fontWeight: '600' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  cardTitle: {
    fontWeight: '700',
    fontSize: 15,
    color: '#0f172a',
    marginBottom: 6,
  },
  sectionTitle: {
    fontWeight: '700',
    color: '#1e3a8a',
    marginTop: 8,
    marginBottom: 4,
    fontSize: 12,
    textTransform: 'uppercase',
  },
  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  k: { color: '#475569', fontSize: 13 },
  v: { color: '#0f172a', fontSize: 13, textAlign: 'right' },
  vBold: { fontWeight: '700' },
  aviso: { color: '#b45309', fontSize: 12, marginTop: 4 },
  empty: { color: '#64748b', textAlign: 'center', fontSize: 13 },
  subTitle: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
    marginBottom: 2,
  },
  codeBox: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 10,
    marginVertical: 4,
  },
  codeText: {
    color: '#e2e8f0',
    fontFamily: 'monospace',
    fontSize: 12,
  },
  varsBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 8,
    marginTop: 2,
  },
  kMono: { color: '#1e293b', fontSize: 12, fontFamily: 'monospace' },
  vMono: {
    color: '#0f172a',
    fontSize: 12,
    fontFamily: 'monospace',
    textAlign: 'right',
  },
});
