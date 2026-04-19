import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

import { ClientePicker } from '@/components/ClientePicker';
import { ProdutoPicker } from '@/components/ProdutoPicker';
import {
  CondicaoPagtoPicker,
  CondicaoOpt,
} from '@/components/CondicaoPagtoPicker';
import { ClienteRow, getClienteById } from '@/db/repositories/clientes';
import { ProdutoRow, getProdutoById } from '@/db/repositories/produtos';
import { getDb } from '@/db/database';
import { useSessionStore } from '@/stores/session';
import {
  enqueueVenda,
  getOutboxVenda,
  updateOutboxVendaPayload,
} from '@/db/repositories/outbox';

// Forma de pagamento e tipo de venda fixos no app (padrão = 1).
const CD_FORMA_PAGAMENTO_PADRAO = 1;
const CD_TIPO_VENDA_PADRAO = 1;

interface ItemPedido {
  cdProduto: number;
  descricao: string;
  qt: number;
  vlUnitario: number;
  qtDisponivel: number | null;
  permiteSaldoNegativo: boolean;
}

interface CondicaoItem {
  nrParcela: number;
  nrDias: number;
}

interface CondicaoConfig {
  itens: CondicaoItem[];
  prAcrescimo: number;
  prDesconto: number;
}

interface ParcelaEditavel {
  numero: number;
  vencimento: string; // YYYY-MM-DD para edição
  valor: number;
  manual?: boolean;
}

interface Props {
  clientId?: string; // se informado, modo edição
  preCdCliente?: number | null;
  preHoldingId?: number | null;
}

function fmtMoney(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function isoDate(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}T00:00:00.000Z`;
}

function dateToYmd(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function ymdToDate(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return isNaN(d.getTime()) ? null : d;
}

// Aceita digitação no formato dd/mm/aaaa e converte para YYYY-MM-DD
function maskDateBR(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 8);
  let out = digits;
  if (digits.length >= 5) out = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  else if (digits.length >= 3) out = `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return out;
}

function brToYmd(br: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br.trim());
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

function ymdToBr(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return ymd;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function round2(v: number) {
  return Math.round(v * 100) / 100;
}

export function PedidoForm({ clientId, preCdCliente, preHoldingId }: Props) {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const isEdit = !!clientId;

  const [cliPickerOpen, setCliPickerOpen] = useState(false);
  const [prodPickerOpen, setProdPickerOpen] = useState(false);
  const [condPickerOpen, setCondPickerOpen] = useState(false);
  const [cliente, setCliente] = useState<ClienteRow | null>(null);
  const [itens, setItens] = useState<ItemPedido[]>([]);
  const [obs, setObs] = useState('');

  const [condicaoSel, setCondicaoSel] = useState<CondicaoOpt | null>(null);
  const [parcelas, setParcelas] = useState<ParcelaEditavel[]>([]);
  const [parcelasManuais, setParcelasManuais] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(isEdit);

  // Pré-selecionar cliente passado por param (modo "novo via cliente")
  useEffect(() => {
    if (isEdit) return;
    if (preCdCliente && preHoldingId) {
      (async () => {
        const c = await getClienteById(preCdCliente, preHoldingId);
        if (c) setCliente(c);
      })();
    }
  }, [isEdit, preCdCliente, preHoldingId]);

  // Carregar pedido existente em modo edição
  useEffect(() => {
    if (!clientId) return;
    (async () => {
      setCarregando(true);
      try {
        const row = await getOutboxVenda(clientId);
        if (!row) {
          Alert.alert('Pedido', 'Pedido não encontrado.');
          router.back();
          return;
        }
        if (row.status === 'sent' || row.status === 'sending') {
          Alert.alert(
            'Não permitido',
            'Este pedido já foi enviado e não pode mais ser editado pelo aplicativo.',
          );
          router.back();
          return;
        }

        const cli = await getClienteById(row.cd_cliente, row.holding_id);
        if (cli) setCliente(cli);

        const payload = JSON.parse(row.payload || '{}');
        const display = payload.__display || {};
        setObs(display.observacao || payload.obs || '');

        // Carregar itens enriquecidos com estoque atual
        const rawItens: any[] = display.itens?.length
          ? display.itens
          : (payload.prevendaItem || []).map((it: any) => ({
              cdProduto: it.cdProduto,
              descricao: `Produto #${it.cdProduto}`,
              qt: Number(it.qtProduto) || 0,
              vlUnitario: Number(it.vlUnitario) || 0,
              vlTotal:
                Number(it.qtProduto || 0) * Number(it.vlUnitario || 0),
            }));

        const itensCarregados: ItemPedido[] = [];
        for (const it of rawItens) {
          const prod = await getProdutoById(
            Number(it.cdProduto),
            row.holding_id,
          );
          itensCarregados.push({
            cdProduto: Number(it.cdProduto),
            descricao: it.descricao || prod?.descricao || `Produto #${it.cdProduto}`,
            qt: Number(it.qt) || 0,
            vlUnitario: Number(it.vlUnitario) || 0,
            qtDisponivel: prod?.qt_disponivel ?? null,
            permiteSaldoNegativo: extractPermiteSaldoNegativo(prod?.raw_json),
          });
        }
        setItens(itensCarregados);

        if (payload.cdCondicaoPagto) {
          const db = await getDb();
          const cond = await db.getFirstAsync<CondicaoOpt>(
            'SELECT cd_condicao, descricao, qt_parcelas, raw_json FROM condicao_pagto WHERE cd_condicao = ?',
            [payload.cdCondicaoPagto],
          );
          if (cond) setCondicaoSel(cond);
        }

        // Restaurar parcelas como editadas (modo manual já que pode ter sido alterado)
        const pr: ParcelaEditavel[] = (display.parcelas || payload.prevendaTitulo || []).map(
          (p: any) => {
            const venc =
              p.vencimento && p.vencimento.length >= 10
                ? p.vencimento.slice(0, 10)
                : p.dtVencto && String(p.dtVencto).length >= 10
                  ? String(p.dtVencto).slice(0, 10)
                  : dateToYmd(new Date());
            return {
              numero: Number(p.numero ?? p.nrParcela) || 1,
              vencimento: venc,
              valor: Number(p.valor ?? p.vlTitulo) || 0,
              manual: true,
            };
          },
        );
        if (pr.length) {
          setParcelas(pr);
          setParcelasManuais(true);
        }
      } finally {
        setCarregando(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const total = useMemo(
    () => itens.reduce((acc, it) => acc + it.qt * it.vlUnitario, 0),
    [itens],
  );

  const condicaoConfig = useMemo<CondicaoConfig>(() => {
    if (!condicaoSel) return { itens: [], prAcrescimo: 0, prDesconto: 0 };
    let parsed: any = null;
    try {
      parsed = condicaoSel.raw_json ? JSON.parse(condicaoSel.raw_json) : null;
    } catch {
      parsed = null;
    }
    const itensRaw: any[] = Array.isArray(parsed?.CondicaoPagtoItem)
      ? parsed.CondicaoPagtoItem
      : [];
    let parcelasCfg: CondicaoItem[] = itensRaw
      .map((it: any) => ({
        nrParcela: Number(it?.nrParcela) || 0,
        nrDias: Number(it?.nrDias) || 0,
      }))
      .filter((it) => it.nrParcela > 0)
      .sort((a, b) => a.nrParcela - b.nrParcela);

    if (parcelasCfg.length === 0) {
      const qt = condicaoSel.qt_parcelas ?? 1;
      parcelasCfg = Array.from({ length: Math.max(1, qt) }, (_, i) => ({
        nrParcela: i + 1,
        nrDias: 30 * (i + 1),
      }));
    }

    return {
      itens: parcelasCfg,
      prAcrescimo: Number(parsed?.prAcrescimo) || 0,
      prDesconto: Number(parsed?.prDesconto) || 0,
    };
  }, [condicaoSel]);

  const totalComAjuste = useMemo(() => {
    const fator =
      1 +
      (condicaoConfig.prAcrescimo || 0) / 100 -
      (condicaoConfig.prDesconto || 0) / 100;
    return round2(total * fator);
  }, [total, condicaoConfig]);

  // Regenerar parcelas quando condição/itens/total mudar (apenas em modo automático)
  useEffect(() => {
    if (parcelasManuais) return;
    const cfg = condicaoConfig.itens;
    if (cfg.length === 0 || totalComAjuste <= 0) {
      setParcelas([]);
      return;
    }
    const qt = cfg.length;
    const base = round2(totalComAjuste / qt);
    const out: ParcelaEditavel[] = [];
    let acumulado = 0;
    const hoje = new Date();
    for (let i = 0; i < qt; i++) {
      const valor =
        i === qt - 1 ? round2(totalComAjuste - acumulado) : base;
      acumulado += valor;
      const venc = new Date(hoje);
      venc.setUTCDate(venc.getUTCDate() + cfg[i].nrDias);
      out.push({
        numero: cfg[i].nrParcela,
        vencimento: dateToYmd(venc),
        valor,
      });
    }
    setParcelas(out);
  }, [condicaoConfig, totalComAjuste, parcelasManuais]);

  const totalParcelas = useMemo(
    () => round2(parcelas.reduce((a, p) => a + p.valor, 0)),
    [parcelas],
  );

  function adicionarProduto(p: ProdutoRow) {
    const exist = itens.find((it) => it.cdProduto === p.cd_produto);
    const permite = extractPermiteSaldoNegativo(p.raw_json);
    const disponivel = p.qt_disponivel ?? null;
    if (exist) {
      const nova = exist.qt + 1;
      if (!permite && disponivel != null && nova > disponivel) {
        Alert.alert(
          'Estoque insuficiente',
          `O produto "${p.descricao}" possui apenas ${disponivel} em estoque.`,
        );
        return;
      }
      setItens((prev) =>
        prev.map((it) =>
          it.cdProduto === p.cd_produto ? { ...it, qt: nova } : it,
        ),
      );
    } else {
      if (!permite && disponivel != null && disponivel < 1) {
        Alert.alert(
          'Estoque insuficiente',
          `O produto "${p.descricao}" não possui saldo em estoque.`,
        );
        return;
      }
      setItens((prev) => [
        ...prev,
        {
          cdProduto: p.cd_produto,
          descricao: p.descricao ?? `Produto ${p.cd_produto}`,
          qt: 1,
          vlUnitario: p.vl_venda ?? 0,
          qtDisponivel: disponivel,
          permiteSaldoNegativo: permite,
        },
      ]);
    }
  }

  function alterarQtd(cdProduto: number, novaQtd: number) {
    setItens((prev) =>
      prev.map((it) => {
        if (it.cdProduto !== cdProduto) return it;
        if (novaQtd <= 0) return { ...it, qt: 0 };
        if (
          !it.permiteSaldoNegativo &&
          it.qtDisponivel != null &&
          novaQtd > it.qtDisponivel
        ) {
          Alert.alert(
            'Estoque insuficiente',
            `O produto "${it.descricao}" possui apenas ${it.qtDisponivel} em estoque.`,
          );
          return it;
        }
        return { ...it, qt: novaQtd };
      }),
    );
  }

  function alterarPreco(cdProduto: number, vl: number) {
    setItens((prev) =>
      prev.map((it) =>
        it.cdProduto === cdProduto ? { ...it, vlUnitario: vl } : it,
      ),
    );
  }

  function removerItem(cdProduto: number) {
    setItens((prev) => prev.filter((it) => it.cdProduto !== cdProduto));
  }

  function alterarParcelaValor(numero: number, vl: number) {
    setParcelasManuais(true);
    setParcelas((prev) =>
      prev.map((p) =>
        p.numero === numero ? { ...p, valor: vl, manual: true } : p,
      ),
    );
  }

  function alterarParcelaVencimento(numero: number, ymd: string | null) {
    if (!ymd) return;
    setParcelasManuais(true);
    setParcelas((prev) =>
      prev.map((p) =>
        p.numero === numero ? { ...p, vencimento: ymd, manual: true } : p,
      ),
    );
  }

  function regenerarParcelas() {
    setParcelasManuais(false);
  }

  async function salvar() {
    if (!user) return;
    if (!cliente) return Alert.alert('Atenção', 'Selecione o cliente.');
    if (!itens.length) return Alert.alert('Atenção', 'Adicione pelo menos um item.');
    if (itens.some((it) => it.qt <= 0)) {
      return Alert.alert('Atenção', 'Existe(m) item(ns) com quantidade zero.');
    }
    if (!condicaoSel)
      return Alert.alert('Atenção', 'Selecione a condição de pagamento.');
    if (!parcelas.length)
      return Alert.alert('Atenção', 'Sem parcelas geradas. Verifique a condição.');

    const diff = round2(totalParcelas - totalComAjuste);
    if (Math.abs(diff) > 0.01) {
      const ok = await new Promise<boolean>((resolve) => {
        Alert.alert(
          'Parcelas divergentes',
          `Soma das parcelas (${fmtMoney(totalParcelas)}) difere do total (${fmtMoney(
            totalComAjuste,
          )}). Deseja continuar mesmo assim?`,
          [
            { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Continuar', onPress: () => resolve(true) },
          ],
        );
      });
      if (!ok) return;
    }

    setSalvando(true);
    try {
      const cId = clientId || uuidv4();
      const dtEmissao = new Date().toISOString();

      const prevendaItem = itens.map((it) => ({
        cdProduto: it.cdProduto,
        qtProduto: it.qt,
        vlCusto: 0,
        vlUnitario: it.vlUnitario,
        vlDesconto: 0,
        prComissao: 0,
        vlAcrescimo: 0,
        cdFuncionario: user.userId,
        qtEntregaSeparacao: 0,
        qtEntregaConferido: 0,
        idProdutoPromocao: 'N',
        qtDevolvido: 0,
        vlPromocao: 0,
      }));

      const prevendaTitulo = parcelas.map((p) => ({
        nrParcela: p.numero,
        dtEmissao,
        dtVencto: `${p.vencimento}T00:00:00.000Z`,
        vlTitulo: p.valor,
        nrForma: CD_FORMA_PAGAMENTO_PADRAO,
      }));

      const prevendaFormaPagamento = parcelas.map((p) => ({
        idFormaPagamento: CD_FORMA_PAGAMENTO_PADRAO,
        nrParcela: p.numero,
        vlParcela: p.valor,
        vlTotal: totalComAjuste,
        vlFormaOriginal: p.valor,
      }));

      const prAcrescimo = condicaoConfig.prAcrescimo || 0;
      const prDesconto = condicaoConfig.prDesconto || 0;
      const vlAcrescimoTotal = round2((total * prAcrescimo) / 100);
      const vlDescontoTotal = round2((total * prDesconto) / 100);

      const uploadPayload = {
        cdEmpresa: user.cdEmpresa,
        cdCliente: cliente.cd_cliente,
        cdCondicaoPagto: condicaoSel.cd_condicao,
        cdTipoVenda: CD_TIPO_VENDA_PADRAO,
        cdFormaPagamento: CD_FORMA_PAGAMENTO_PADRAO,
        dtEmissao,
        obs: obs.trim() || undefined,
        vlBruto: total,
        prAcrescimo,
        vlAcrescimoTotal,
        prDesconto,
        vlDescontoTotal,
        vlTotal: totalComAjuste,
        prevendaItem,
        prevendaTitulo,
        prevendaFormaPagamento,
        prevendaFuncionarioAuxiliar: [],
      };

      const displayPayload = {
        condicaoLabel: condicaoSel.descricao,
        observacao: obs.trim() || null,
        itens: itens.map((it) => ({
          cdProduto: it.cdProduto,
          descricao: it.descricao,
          qt: it.qt,
          vlUnitario: it.vlUnitario,
          vlTotal: round2(it.qt * it.vlUnitario),
        })),
        parcelas: parcelas.map((p) => ({
          numero: p.numero,
          vencimento: p.vencimento,
          valor: p.valor,
        })),
      };

      if (isEdit) {
        await updateOutboxVendaPayload(
          cId,
          { ...uploadPayload, __display: displayPayload },
          totalComAjuste,
        );
      } else {
        await enqueueVenda({
          clientId: cId,
          cdCliente: cliente.cd_cliente,
          cdEmpresa: user.cdEmpresa,
          holdingId: user.holdingId,
          payload: { ...uploadPayload, __display: displayPayload },
          vlTotal: totalComAjuste,
        });
      }

      Alert.alert(
        isEdit ? 'Pedido atualizado' : 'Pedido salvo',
        isEdit
          ? 'Alterações registradas. Use "Enviar Informações" para sincronizar.'
          : 'Pedido registrado offline. Use "Enviar Informações" quando estiver online.',
      );
      router.back();
    } catch (err) {
      console.error(err);
      Alert.alert('Erro', 'Não foi possível salvar o pedido.');
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return (
      <View style={styles.loadingBox}>
        <Text style={styles.placeholder}>Carregando pedido...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 80 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.label}>Cliente</Text>
      <Pressable
        style={styles.field}
        onPress={() => !isEdit && setCliPickerOpen(true)}
        disabled={isEdit}
      >
        <Text style={cliente ? styles.value : styles.placeholder}>
          {cliente ? cliente.nome : 'Selecionar cliente...'}
        </Text>
        {isEdit && (
          <Text style={styles.subtle}>Cliente não pode ser alterado em edição.</Text>
        )}
      </Pressable>

      <View style={styles.itensHeader}>
        <Text style={styles.label}>Itens ({itens.length})</Text>
        <Pressable style={styles.addBtn} onPress={() => setProdPickerOpen(true)}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.addBtnText}>Adicionar</Text>
        </Pressable>
      </View>

      {itens.length === 0 ? (
        <Text style={styles.placeholder}>Nenhum item adicionado.</Text>
      ) : (
        itens.map((it) => (
          <View key={it.cdProduto} style={styles.itemBox}>
            <View style={{ flex: 1 }}>
              <Text style={styles.value}>{it.descricao}</Text>
              {it.qtDisponivel != null && (
                <Text style={styles.subtle}>
                  Estoque: {it.qtDisponivel}
                  {it.permiteSaldoNegativo ? ' (permite negativo)' : ''}
                </Text>
              )}
              <View style={styles.itemRow}>
                <View style={{ flex: 1.4 }}>
                  <Text style={styles.itemLbl}>Qtd</Text>
                  <View style={styles.qtdBox}>
                    <Pressable
                      style={styles.qtdBtn}
                      onPress={() => alterarQtd(it.cdProduto, Math.max(0, it.qt - 1))}
                    >
                      <Ionicons name="remove" size={18} color="#fff" />
                    </Pressable>
                    <TextInput
                      style={styles.qtdInput}
                      keyboardType="numeric"
                      value={String(it.qt)}
                      onChangeText={(t) =>
                        alterarQtd(it.cdProduto, Number(t.replace(',', '.')) || 0)
                      }
                      selectTextOnFocus
                    />
                    <Pressable
                      style={styles.qtdBtn}
                      onPress={() => alterarQtd(it.cdProduto, it.qt + 1)}
                    >
                      <Ionicons name="add" size={18} color="#fff" />
                    </Pressable>
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemLbl}>Vl. unit.</Text>
                  <TextInput
                    style={styles.itemInput}
                    keyboardType="decimal-pad"
                    value={String(it.vlUnitario)}
                    onChangeText={(t) =>
                      alterarPreco(it.cdProduto, Number(t.replace(',', '.')) || 0)
                    }
                    selectTextOnFocus
                  />
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.itemLbl}>Total</Text>
                  <Text style={styles.itemTotal}>
                    {fmtMoney(it.qt * it.vlUnitario)}
                  </Text>
                </View>
              </View>
            </View>
            <Pressable
              onPress={() => removerItem(it.cdProduto)}
              style={styles.removeBtn}
              hitSlop={10}
            >
              <Ionicons name="trash" size={18} color="#dc2626" />
            </Pressable>
          </View>
        ))
      )}

      <Text style={styles.label}>Condição de pagamento</Text>
      <Pressable style={styles.field} onPress={() => setCondPickerOpen(true)}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={condicaoSel ? styles.value : styles.placeholder}>
              {condicaoSel
                ? `#${condicaoSel.cd_condicao} • ${condicaoSel.descricao}`
                : 'Selecionar condição...'}
            </Text>
            {condicaoSel && (
              <Text style={styles.subtle}>
                {condicaoConfig.itens.length}{' '}
                {condicaoConfig.itens.length === 1 ? 'parcela' : 'parcelas'}
                {condicaoConfig.prAcrescimo > 0
                  ? ` • acréscimo ${condicaoConfig.prAcrescimo}%`
                  : ''}
                {condicaoConfig.prDesconto > 0
                  ? ` • desconto ${condicaoConfig.prDesconto}%`
                  : ''}
              </Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={20} color="#64748b" />
        </View>
      </Pressable>

      {parcelas.length > 0 && (
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={styles.label}>Parcelas</Text>
            {parcelasManuais && (
              <Pressable onPress={regenerarParcelas} hitSlop={10}>
                <Text style={styles.linkBtn}>Regerar</Text>
              </Pressable>
            )}
          </View>
          {parcelas.map((p) => (
            <View key={p.numero} style={styles.parcelaCard}>
              <Text style={styles.parcelaNum}>
                {p.numero}/{parcelas.length}
              </Text>
              <View style={{ flex: 1.2 }}>
                <Text style={styles.itemLbl}>Vencimento</Text>
                <TextInput
                  style={styles.itemInput}
                  value={ymdToBr(p.vencimento)}
                  keyboardType="numeric"
                  placeholder="dd/mm/aaaa"
                  maxLength={10}
                  onChangeText={(t) => {
                    const masked = maskDateBR(t);
                    const ymd = brToYmd(masked);
                    setParcelasManuais(true);
                    setParcelas((prev) =>
                      prev.map((x) =>
                        x.numero === p.numero
                          ? {
                              ...x,
                              vencimento: ymd || x.vencimento,
                              manual: true,
                            }
                          : x,
                      ),
                    );
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemLbl}>Valor</Text>
                <TextInput
                  style={styles.itemInput}
                  keyboardType="decimal-pad"
                  value={String(p.valor)}
                  onChangeText={(t) =>
                    alterarParcelaValor(p.numero, Number(t.replace(',', '.')) || 0)
                  }
                  selectTextOnFocus
                />
              </View>
            </View>
          ))}
          {Math.abs(totalParcelas - totalComAjuste) > 0.01 && (
            <Text style={styles.warn}>
              Soma das parcelas: {fmtMoney(totalParcelas)} (difere do total{' '}
              {fmtMoney(totalComAjuste)})
            </Text>
          )}
        </View>
      )}

      <Text style={styles.label}>Observação</Text>
      <TextInput
        style={[styles.input, { minHeight: 70 }]}
        value={obs}
        onChangeText={setObs}
        multiline
        placeholder="Observações adicionais"
      />

      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Subtotal</Text>
        <Text style={styles.totalValue}>{fmtMoney(total)}</Text>
      </View>
      {(condicaoConfig.prAcrescimo > 0 || condicaoConfig.prDesconto > 0) && (
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>
            {condicaoConfig.prAcrescimo > 0
              ? `Acréscimo (${condicaoConfig.prAcrescimo}%)`
              : `Desconto (${condicaoConfig.prDesconto}%)`}
          </Text>
          <Text style={styles.totalValue}>{fmtMoney(totalComAjuste - total)}</Text>
        </View>
      )}
      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Total do pedido</Text>
        <Text style={styles.totalValue}>{fmtMoney(totalComAjuste)}</Text>
      </View>

      <Pressable
        style={[styles.button, salvando && { opacity: 0.6 }]}
        onPress={salvar}
        disabled={salvando}
      >
        <Text style={styles.buttonText}>
          {salvando
            ? 'Salvando...'
            : isEdit
              ? 'Atualizar Pedido'
              : 'Salvar Pedido'}
        </Text>
      </Pressable>

      <ClientePicker
        visible={cliPickerOpen}
        onClose={() => setCliPickerOpen(false)}
        onSelect={setCliente}
      />
      <ProdutoPicker
        visible={prodPickerOpen}
        onClose={() => setProdPickerOpen(false)}
        onSelect={adicionarProduto}
      />
      <CondicaoPagtoPicker
        visible={condPickerOpen}
        onClose={() => setCondPickerOpen(false)}
        onSelect={(c) => {
          setCondicaoSel(c);
          setParcelasManuais(false);
        }}
        selectedId={condicaoSel?.cd_condicao ?? null}
      />
    </ScrollView>
  );
}

function extractPermiteSaldoNegativo(rawJson?: string | null) {
  if (!rawJson) return true; // sem info: permite (não bloqueia)
  try {
    const parsed = JSON.parse(rawJson);
    // Mesma regra do frontend web (venda-itens): só bloqueia se 'N' e tipo 'P'
    if (parsed?.idSaldoNegativo === 'N' && parsed?.idTipoProduto === 'P')
      return false;
    return true;
  } catch {
    return true;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  loadingBox: { padding: 24, alignItems: 'center' },
  label: { fontWeight: '700', color: '#334155' },
  field: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  value: { color: '#0f172a', fontWeight: '600' },
  placeholder: { color: '#94a3b8' },
  subtle: { color: '#64748b', fontSize: 12, marginTop: 2 },
  itensHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  addBtn: {
    flexDirection: 'row',
    backgroundColor: '#2563eb',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    gap: 4,
  },
  addBtnText: { color: '#fff', fontWeight: '700' },
  itemBox: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 10,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  itemRow: { flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'flex-end' },
  itemLbl: { fontSize: 11, color: '#64748b' },
  itemInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#f8fafc',
    minWidth: 60,
  },
  itemTotal: { color: '#16a34a', fontWeight: '700' },
  removeBtn: { padding: 6 },
  qtdBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  qtdBtn: {
    backgroundColor: '#2563eb',
    width: 32,
    height: 32,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtdInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#f8fafc',
    minWidth: 50,
    textAlign: 'center',
    flex: 1,
  },
  card: { backgroundColor: '#fff', padding: 12, borderRadius: 10, gap: 8 },
  parcelaCard: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-end',
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: '#f1f5f9',
  },
  parcelaNum: {
    fontWeight: '700',
    color: '#1e3a8a',
    width: 36,
    paddingBottom: 8,
  },
  warn: { color: '#b45309', fontSize: 12, marginTop: 4 },
  linkBtn: { color: '#2563eb', fontWeight: '700' },
  input: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    textAlignVertical: 'top',
  },
  totalCard: {
    backgroundColor: '#0f172a',
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  totalLabel: { color: '#cbd5e1', fontWeight: '600' },
  totalValue: { color: '#22c55e', fontWeight: '800', fontSize: 22 },
  button: {
    backgroundColor: '#16a34a',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
