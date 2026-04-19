import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Switch,
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
import { KeyboardAwareScreen } from '@/components/KeyboardAwareScreen';
import { ClienteRow, getClienteById } from '@/db/repositories/clientes';
import { ProdutoRow, getProdutoById } from '@/db/repositories/produtos';
import { getDb } from '@/db/database';
import { useSessionStore } from '@/stores/session';
import { useOnlineStore } from '@/stores/online';
import {
  enqueueVenda,
  getOutboxVenda,
  updateOutboxVendaPayload,
} from '@/db/repositories/outbox';
import { gerarPdfPedido, lerPdfBase64 } from '@/services/pdfVenda';
import { enviarVendaPorEmail } from '@/api/email';
import { extractApiErrorMessage } from '@/api/client';

// Forma de pagamento (4 = Crediário) e tipo de venda (1) fixos no app.
const CD_FORMA_PAGAMENTO_PADRAO = 4;
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
  vencimento: string; // YYYY-MM-DD canônico
  vencimentoInput?: string; // texto enquanto o usuário digita (dd/mm/aaaa)
  valor: number;
  valorInput?: string; // texto enquanto o usuário digita (sem persistir)
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
  const isOnline = useOnlineStore((s) => s.isOnline);
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

  // Envio automático por e-mail ao salvar novo pedido (não disponível em edição).
  const [enviarEmailAoSalvar, setEnviarEmailAoSalvar] = useState(false);
  const [emailDest, setEmailDest] = useState('');

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

  // Quando o cliente é selecionado, pré-popular o destino do email.
  useEffect(() => {
    if (cliente?.email) setEmailDest(cliente.email);
  }, [cliente?.email]);

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

  // Redistribui valores: se a parcela alterada NÃO for a última, ajusta as
  // de baixo. Se for a última, ajusta as de cima. O total final permanece
  // sempre = totalComAjuste, com a diferença de centavos absorvida pela
  // última parcela ajustada (para evitar arredondamento "espalhado").
  function alterarParcelaValor(numero: number, novoValor: number) {
    setParcelasManuais(true);
    setParcelas((prev) => {
      if (prev.length === 0 || totalComAjuste <= 0) return prev;
      const idx = prev.findIndex((p) => p.numero === numero);
      if (idx < 0) return prev;

      const valor = isFinite(novoValor) && novoValor >= 0 ? novoValor : 0;
      const next = prev.map((p) => ({ ...p }));
      next[idx] = { ...next[idx], valor, manual: true };

      const isUltima = idx === next.length - 1;
      if (isUltima) {
        // Recalcula as de cima (índices 0..idx-1).
        const restante = round2(totalComAjuste - valor);
        const antes = next.slice(0, idx).length;
        if (antes > 0) {
          const base = round2(restante / antes);
          let acumulado = 0;
          for (let i = 0; i < idx; i++) {
            const v = i === idx - 1 ? round2(restante - acumulado) : base;
            acumulado += v;
            next[i] = { ...next[i], valor: v };
          }
        }
      } else {
        // Recalcula as de baixo (idx+1..N-1).
        const somaAntes = next.slice(0, idx + 1).reduce((a, p) => a + p.valor, 0);
        const restante = round2(totalComAjuste - somaAntes);
        const depois = next.length - (idx + 1);
        if (depois > 0) {
          const base = round2(restante / depois);
          let acumulado = 0;
          for (let i = idx + 1; i < next.length; i++) {
            const v =
              i === next.length - 1 ? round2(restante - acumulado) : base;
            acumulado += v;
            next[i] = { ...next[i], valor: v };
          }
        }
      }
      return next;
    });
  }

  // Vencimentos: ao alterar uma parcela, desloca as demais (de baixo se não
  // for a última; de cima se for) preservando o intervalo entre elas.
  function alterarParcelaVencimento(numero: number, ymd: string) {
    setParcelasManuais(true);
    setParcelas((prev) => {
      const idx = prev.findIndex((p) => p.numero === numero);
      if (idx < 0) return prev;

      const novaData = ymdToDate(ymd);
      const antigaData = ymdToDate(prev[idx].vencimento);
      if (!novaData || !antigaData) {
        return prev.map((p, i) =>
          i === idx ? { ...p, vencimento: ymd, manual: true } : p,
        );
      }

      const diffDias = Math.round(
        (novaData.getTime() - antigaData.getTime()) / (1000 * 60 * 60 * 24),
      );

      const next = prev.map((p, i) => {
        if (i === idx) return { ...p, vencimento: ymd, manual: true };
        const isUltima = idx === prev.length - 1;
        const aplicar = isUltima ? i < idx : i > idx;
        if (!aplicar) return p;
        const d = ymdToDate(p.vencimento);
        if (!d) return p;
        d.setUTCDate(d.getUTCDate() + diffDias);
        return { ...p, vencimento: dateToYmd(d), vencimentoInput: undefined };
      });
      return next;
    });
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

    if (enviarEmailAoSalvar && !isEdit) {
      if (!isOnline) {
        return Alert.alert(
          'Sem conexão',
          'Para enviar o e-mail automaticamente é necessário estar online. Desmarque a opção ou conecte-se à internet.',
        );
      }
      if (!emailDest || !emailDest.includes('@')) {
        return Alert.alert(
          'E-mail',
          'Informe um e-mail válido para envio automático ou desmarque a opção.',
        );
      }
    }

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

      // Mesmo cálculo do projeto web (calculaTotalVenda):
      //   vlBruto = soma_itens - vlDescontoTotal
      //   vlTotal = vlBruto + vlAcrescimoTotal
      // Respeita edição manual de parcelas (soma das parcelas como total final)
      const vlFinal = parcelasManuais
        ? round2(totalParcelas)
        : round2(totalComAjuste);
      const diffAjuste = round2(vlFinal - total);
      const vlAcrescimoTotal = diffAjuste > 0 ? diffAjuste : 0;
      const vlDescontoTotal = diffAjuste < 0 ? -diffAjuste : 0;
      // vl_bruto também passa a refletir o valor já com acréscimo somado
      // (e desconto subtraído), conforme regra do projeto.
      const vlTotalSalvar = round2(total - vlDescontoTotal + vlAcrescimoTotal);
      const vlBrutoSalvar = vlTotalSalvar;

      // Percentuais: priorizam o cadastro da condição. Se o usuário editou
      // parcelas e o ajuste real divergir, recalcula o % baseado no efetivo
      // (assim o registro fica consistente com vlAcrescimoTotal).
      const prAcrescimoCfg = condicaoConfig.prAcrescimo || 0;
      const prDescontoCfg = condicaoConfig.prDesconto || 0;
      const prAcrescimo =
        vlAcrescimoTotal > 0 && vlBrutoSalvar > 0
          ? round2((vlAcrescimoTotal / vlBrutoSalvar) * 100)
          : prAcrescimoCfg;
      const prDesconto =
        vlDescontoTotal > 0 && total > 0
          ? round2((vlDescontoTotal / total) * 100)
          : prDescontoCfg;

      // PrevendaFormaPagamento: PK = (holding, empresa, prevenda, idFormaPagamento)
      // → uma linha POR FORMA (não por parcela). Mesma regra do projeto web.
      const vlPrimeiraParcela = parcelas[0]?.valor ?? vlTotalSalvar;
      const prevendaFormaPagamento = [
        {
          idFormaPagamento: CD_FORMA_PAGAMENTO_PADRAO,
          nrParcela: parcelas.length || 1,
          vlParcela: vlPrimeiraParcela,
          vlTotal: vlTotalSalvar,
          vlFormaOriginal: vlTotalSalvar,
        },
      ];

      const uploadPayload = {
        cdEmpresa: user.cdEmpresa,
        cdCliente: cliente.cd_cliente,
        cdCondicaoPagto: condicaoSel.cd_condicao,
        cdTipoVenda: CD_TIPO_VENDA_PADRAO,
        cdFormaPagamento: CD_FORMA_PAGAMENTO_PADRAO,
        dtEmissao,
        obs: obs.trim() || undefined,
        vlBruto: vlBrutoSalvar,
        prAcrescimo,
        vlAcrescimoTotal,
        vlAcrescimoTotalItem: 0,
        prDesconto,
        vlDescontoTotal,
        vlTotal: vlTotalSalvar,
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
          vlTotalSalvar,
        );
      } else {
        await enqueueVenda({
          clientId: cId,
          cdCliente: cliente.cd_cliente,
          cdEmpresa: user.cdEmpresa,
          holdingId: user.holdingId,
          payload: { ...uploadPayload, __display: displayPayload },
          vlTotal: vlTotalSalvar,
        });
      }

      // Envio automático por e-mail (apenas em novo pedido + checkbox marcado).
      if (enviarEmailAoSalvar && !isEdit) {
        try {
          const numero = cId.slice(0, 8).toUpperCase();
          const pdfUri = await gerarPdfPedido({
            numero,
            clienteNome: cliente.nome ?? `Cliente #${cliente.cd_cliente}`,
            clienteCpfCnpj: cliente.cpf_cnpj ?? null,
            clienteEndereco: `${cliente.endereco ?? ''} ${cliente.numero ?? ''} - ${cliente.bairro ?? ''}`,
            data: new Date(dtEmissao).toLocaleString('pt-BR'),
            itens: displayPayload.itens,
            vlTotal: totalComAjuste,
            formaPagamento: condicaoSel.descricao,
            parcelas: displayPayload.parcelas,
            observacao: displayPayload.observacao,
          });
          const base64 = await lerPdfBase64(pdfUri);
          await enviarVendaPorEmail({
            to: emailDest,
            subject: `Pedido ${numero}`,
            nrPrevenda: numero,
            pdfBase64: base64,
            filename: `pedido-${numero}.pdf`,
          });
          Alert.alert(
            'Pedido salvo',
            `Pedido registrado e e-mail enviado para ${emailDest}.`,
          );
        } catch (err) {
          Alert.alert(
            'E-mail não enviado',
            `O pedido foi salvo, mas o e-mail falhou: ${extractApiErrorMessage(err)}`,
          );
        }
      } else {
        Alert.alert(
          isEdit ? 'Pedido atualizado' : 'Pedido salvo',
          isEdit
            ? 'Alterações registradas. Use "Enviar Informações" para sincronizar.'
            : 'Pedido registrado offline. Use "Enviar Informações" quando estiver online.',
        );
      }
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
    <KeyboardAwareScreen
      style={styles.container}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 80 }}
    >
      <Text style={styles.label}>Cliente</Text>
      <Pressable style={styles.field} onPress={() => setCliPickerOpen(true)}>
        <Text style={cliente ? styles.value : styles.placeholder}>
          {cliente ? cliente.nome : 'Selecionar cliente...'}
        </Text>
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
                  value={p.vencimentoInput ?? ymdToBr(p.vencimento)}
                  keyboardType="numeric"
                  placeholder="dd/mm/aaaa"
                  maxLength={10}
                  onChangeText={(t) => {
                    const masked = maskDateBR(t);
                    setParcelasManuais(true);
                    // Sempre atualiza o texto digitado para não travar o input
                    setParcelas((prev) =>
                      prev.map((x) =>
                        x.numero === p.numero
                          ? { ...x, vencimentoInput: masked }
                          : x,
                      ),
                    );
                    // Quando completa data válida, persiste e redistribui
                    if (masked.length === 10) {
                      const ymd = brToYmd(masked);
                      if (ymd) {
                        alterarParcelaVencimento(p.numero, ymd);
                        setParcelas((prev) =>
                          prev.map((x) =>
                            x.numero === p.numero
                              ? { ...x, vencimentoInput: undefined }
                              : x,
                          ),
                        );
                      }
                    }
                  }}
                  onBlur={() => {
                    // Limpa o input incompleto ao sair do foco (volta ao canônico)
                    setParcelas((prev) =>
                      prev.map((x) =>
                        x.numero === p.numero
                          ? { ...x, vencimentoInput: undefined }
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
                  value={p.valorInput ?? String(p.valor)}
                  onChangeText={(t) => {
                    setParcelas((prev) =>
                      prev.map((x) =>
                        x.numero === p.numero ? { ...x, valorInput: t } : x,
                      ),
                    );
                  }}
                  onEndEditing={(e) => {
                    const v = Number(
                      String(e.nativeEvent.text).replace(',', '.'),
                    );
                    alterarParcelaValor(
                      p.numero,
                      isFinite(v) && v >= 0 ? v : 0,
                    );
                    setParcelas((prev) =>
                      prev.map((x) =>
                        x.numero === p.numero ? { ...x, valorInput: undefined } : x,
                      ),
                    );
                  }}
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

      {!isEdit && (
        <View style={styles.emailCard}>
          <View style={styles.emailRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Enviar por e-mail ao salvar</Text>
              <Text style={styles.subtle}>
                {cliente?.email
                  ? `Padrão: ${cliente.email}`
                  : 'Cliente sem e-mail cadastrado — informe abaixo.'}
              </Text>
            </View>
            <Switch
              value={enviarEmailAoSalvar}
              onValueChange={setEnviarEmailAoSalvar}
              trackColor={{ true: '#16a34a', false: '#cbd5e1' }}
            />
          </View>
          {enviarEmailAoSalvar && (
            <>
              <TextInput
                style={[styles.input, { marginTop: 8 }]}
                value={emailDest}
                onChangeText={setEmailDest}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="cliente@exemplo.com"
              />
              {!isOnline && (
                <Text style={styles.warn}>
                  Você está offline. Conecte-se para enviar pelo servidor.
                </Text>
              )}
            </>
          )}
        </View>
      )}

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
    </KeyboardAwareScreen>
  );
}

function extractPermiteSaldoNegativo(rawJson?: string | null) {
  if (!rawJson) return true;
  try {
    const parsed = JSON.parse(rawJson);
    const tipo = parsed?.idTipoProduto;
    const flag = parsed?.idSaldoNegativo;
    // Espelha a regra do projeto web (venda-itens.tsx):
    //   bloqueia somente quando idTipoProduto === 'P' e idSaldoNegativo === 'N'
    //   qualquer outro caso (S, A, flag 'S' ou ausente) → permite.
    if (tipo === 'P' && flag === 'N') return false;
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
  emailCard: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 8,
  },
  emailRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  button: {
    backgroundColor: '#16a34a',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
