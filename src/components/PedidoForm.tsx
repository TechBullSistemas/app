import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
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
import { FotoProdutoModal } from '@/components/FotoProdutoModal';
import { TabelaPrecoPicker, type TabelaPrecoOpt } from '@/components/TabelaPrecoPicker';
import {
  CondicaoPagtoPicker,
  CondicaoOpt,
} from '@/components/CondicaoPagtoPicker';
import { CondicaoPrecoPicker } from '@/components/CondicaoPrecoPicker';
import { PrecoDetalheModal } from '@/components/PrecoDetalheModal';
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
import {
  calcularItem,
  resolverTabelaPreco,
  validacaoFlex,
  validacaoVariacaoPreco,
  listarCondicoesPrecoProduto,
  type CondicaoPrecoOpt,
  type ResultadoCalculoItem,
  type ContextoCalculoItem,
} from '@/services/pricing';
import {
  mensagemDescontoPrecoAjustado,
  resolvePrDescontoMax,
  validacaoDescontoMaxUsuarioPreco,
} from '@/services/pricing/descontoMaxUsuario';
import { findTabelaPrecoItem } from '@/db/repositories/tabelaPrecoItem';
import { getEmpresaParametros } from '@/db/repositories/parametros';

// Forma de pagamento (4 = Crediário) e tipo de venda (1) fixos no app.
const CD_FORMA_PAGAMENTO_PADRAO = 4;
const CD_TIPO_VENDA_PADRAO = 1;

interface ItemPedido {
  cdProduto: number;
  descricao: string;
  qt: number;
  vlUnitario: number;
  vlUnitarioOriginal: number; // preço calculado pelo engine (sem edição manual)
  qtDisponivel: number | null;
  permiteSaldoNegativo: boolean;
  // Fator de venda do produto (produto.fator_venda): passo e múltiplo quando > 0.
  // Fator 0 = quantidade livre (inicia em 1, decimais sem restrição).
  fatorVenda: number;
  // Foto do produto (cache local ou URL remota) para miniatura no card.
  fotoUri: string | null;
  // Texto transitório dos inputs de quantidade e preço durante a digitação.
  // Sem isso, o input controlado por String(qt) engole a vírgula decimal:
  // "2," parseia para 2, o estado re-renderiza e a vírgula some antes da
  // casa decimal ser digitada. Limpo no blur (display volta ao normalizado).
  qtInput?: string;
  vlInput?: string;
  // Condição de preço selecionada por item (legado: spn_tabela_condicao_preco).
  // Quando definida, alimenta o pipeline (acréscimo / última venda) e estabelece
  // o preço mínimo para a regra `idPermiteAlterarValorProdutoPalm = "A"`.
  cdCondicaoPreco?: number | null;
  // Descrição da condição (cache, para exibir no botão).
  condicaoPrecoLabel?: string | null;
  // Mínimo permitido (= vlValor da condição selecionada). Usado para impedir
  // que o vendedor digite um valor abaixo no modo "A".
  vlMinimo?: number | null;
  // Resultados do motor de precificação (instantâneo offline).
  // Só são preenchidos quando os dados de imposto/empresa estiverem sincronizados.
  pricing?: ResultadoCalculoItem | null;
  rawProduto?: any | null; // raw_json do produto (para alimentar o engine)
}

interface CondicaoItem {
  nrParcela: number;
  nrDias: number;
}

// O `pr_acrescimo` da condição de pagamento NÃO entra aqui: ele é aplicado
// no preço unitário via fórmula dinâmica (variável `v_pr_acrescimo_condicao`),
// não sobre o total/parcelas do pedido.
interface CondicaoConfig {
  itens: CondicaoItem[];
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
  const [tabPickerOpen, setTabPickerOpen] = useState(false);
  // Picker de condição de preço aberto para um produto específico (cdProduto).
  const [condPrecoOpenFor, setCondPrecoOpenFor] = useState<number | null>(null);
  // Modal de detalhes do preço aberto para um produto específico (cdProduto).
  const [precoDetalheFor, setPrecoDetalheFor] = useState<number | null>(null);
  // Foto expandida do item da venda (cdProduto), aberta pela miniatura.
  const [fotoExpandidaFor, setFotoExpandidaFor] = useState<number | null>(null);
  // Cache das condições de preço calculadas. Chave composta:
  // `cdProduto|qt|cdTabelaPreco|cdCondicaoPagto|cdCliente` — qualquer
  // mudança nesses parâmetros recalcula (espelha o legado, que chama
  // `calculaInformacoes_getVl_unitario` toda vez com a qt e a condicao_pagto
  // atuais; sem isso o picker fica preso em valores antigos e diverge do
  // preço efetivo do item).
  const [condicoesPrecoCache, setCondicoesPrecoCache] = useState<
    Record<string, CondicaoPrecoOpt[]>
  >({});
  // Override manual da tabela de preço (somente quando empresa permite).
  const [tabelaPrecoManual, setTabelaPrecoManual] = useState<TabelaPrecoOpt | null>(null);
  const [cliente, setCliente] = useState<ClienteRow | null>(null);
  const [itens, setItens] = useState<ItemPedido[]>([]);
  const [obs, setObs] = useState('');

  const [condicaoSel, setCondicaoSel] = useState<CondicaoOpt | null>(null);
  const [parcelas, setParcelas] = useState<ParcelaEditavel[]>([]);
  const [parcelasManuais, setParcelasManuais] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(isEdit);

  // Parâmetros da empresa carregados uma vez para alimentar o motor de
  // precificação. Quando ausentes (backend antigo), o motor não roda e o
  // app cai no comportamento original (apenas vlUnitario × qt).
  const [empresaParams, setEmpresaParams] = useState<Awaited<
    ReturnType<typeof getEmpresaParametros>
  > | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const params = await getEmpresaParametros(user.cdEmpresa, user.holdingId);
        setEmpresaParams(params);
      } catch (err) {
        console.warn('PedidoForm: parâmetros do motor indisponíveis', err);
      }
    })();
  }, [user]);

  // Dados do representante vêm direto da sessão (auth/login | auth/me).
  // Não há mais sync de tabela `representante`: tudo vive no User do ERP.
  // IMPORTANTE: a `cdTabelaPreco` do User é independente do vínculo com
  // Representante (que só importa para Flex/comissão). Por isso construímos
  // o engine sempre que houver `representante` na sessão, usando
  // `cdRepresentante = 0` como fallback quando o User não está vinculado.
  const representanteEngine = useMemo(() => {
    if (!user?.representante) return null;
    return {
      cdRepresentante: user.cdRepresentante ?? 0,
      vlSaldoFlex: Number(user.representante.vlSaldoFlex ?? 0),
      prFlexMin: Number(user.representante.prFlexMin ?? 0),
      prFlexMax: Number(user.representante.prFlexMax ?? 0),
      idMargem: (user.representante.idMargem ?? 'N') as 'S' | 'N',
      prMargemLucroMinimo: Number(user.representante.prMargemLucroMinimo ?? 0),
      cdTabelaPreco: user.representante.cdTabelaPreco ?? null,
    };
  }, [user]);

  // Tabela de preço resolvida via cliente → representante → empresa padrão.
  // Quando a empresa permite alteração manual e o vendedor escolhe uma tabela
  // no dropdown, o override `tabelaPrecoManual` tem prioridade.
  const cdTabelaPrecoResolvida = useMemo(() => {
    if (tabelaPrecoManual) return tabelaPrecoManual.cd_tabela;
    if (!empresaParams) return null;
    return resolverTabelaPreco({
      empresa: empresaParams,
      cliente: cliente
        ? { cdCliente: cliente.cd_cliente, cdTabelaPreco: (cliente as any).cd_tabela_preco ?? null }
        : null,
      representante: representanteEngine,
    });
  }, [empresaParams, cliente, representanteEngine, tabelaPrecoManual]);

  // Quando o cliente muda, descarta o override manual (a tabela do novo
  // cliente passa a valer). O vendedor pode reabrir o dropdown se quiser.
  useEffect(() => {
    setTabelaPrecoManual(null);
  }, [cliente?.cd_cliente]);

  // Pré-selecionar a condição de pagamento padrão do cliente (cd_condicao_pagto)
  // ao escolher um cliente em pedidos novos. Em modo edição não sobrescreve a
  // condição já carregada do payload. Se o vendedor já tiver escolhido uma
  // condição manualmente, preserva.
  useEffect(() => {
    if (isEdit) return;
    if (!cliente) return;
    if (condicaoSel) return;
    const cdCond = (cliente as any).cd_condicao_pagto;
    if (cdCond == null) return;
    (async () => {
      try {
        const db = await getDb();
        const cond = await db.getFirstAsync<CondicaoOpt>(
          'SELECT cd_condicao, descricao, qt_parcelas, raw_json FROM condicao_pagto WHERE cd_condicao = ?',
          [Number(cdCond)],
        );
        if (cond) {
          setCondicaoSel(cond);
          setParcelasManuais(false);
        }
      } catch {
        // ignora — usuário poderá escolher manualmente
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente?.cd_cliente]);

  // Descrição da tabela atual (para exibir no botão).
  const [tabelaPrecoDesc, setTabelaPrecoDesc] = useState<string | null>(null);
  useEffect(() => {
    if (!cdTabelaPrecoResolvida) {
      setTabelaPrecoDesc(null);
      return;
    }
    if (tabelaPrecoManual && tabelaPrecoManual.cd_tabela === cdTabelaPrecoResolvida) {
      setTabelaPrecoDesc(tabelaPrecoManual.descricao);
      return;
    }
    (async () => {
      try {
        const db = await getDb();
        const row = await db.getFirstAsync<{ descricao: string }>(
          'SELECT descricao FROM tabela_preco WHERE cd_tabela = ? AND holding_id = ?',
          [cdTabelaPrecoResolvida, user!.holdingId],
        );
        setTabelaPrecoDesc(row?.descricao ?? null);
      } catch {
        setTabelaPrecoDesc(null);
      }
    })();
  }, [cdTabelaPrecoResolvida, tabelaPrecoManual, user]);

  // Edição da tabela: legado deixava sempre desabilitado (TODO no fonte).
  // Aqui respeitamos a flag `idAlteraTabelaPrecoTablet` (default "N" =
  // somente leitura, igual ao comportamento legado).
  const tabelaEditavel = empresaParams?.idAlteraTabelaPrecoTablet === 'S';

  const precoBloqueado = empresaParams?.idBloqueiaAlteracaoPrecoTablet === 'S';
  // Modo de alteração do preço por item (legado: id_permite_alterar_valor_produto_palm)
  //   "S" — livre  |  "A" — só aumentar  |  "N" — readonly
  const modoAlteracaoPreco =
    empresaParams?.idPermiteAlterarValorProdutoPalm ?? 'S';
  const precoReadonly = modoAlteracaoPreco === 'N';
  const precoSomenteAumenta = modoAlteracaoPreco === 'A';

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
          let raw: any = null;
          try {
            raw = prod?.raw_json ? JSON.parse(prod.raw_json) : null;
          } catch {
            raw = null;
          }
          const fator = extractFatorVenda(prod?.fator_venda, prod?.raw_json);
          const vl = Number(it.vlUnitario) || 0;
          itensCarregados.push({
            cdProduto: Number(it.cdProduto),
            descricao: it.descricao || prod?.descricao || `Produto #${it.cdProduto}`,
            qt: snapQtToFator(Number(it.qt) || 0, fator),
            vlUnitario: vl,
            vlUnitarioOriginal: prod?.vl_venda ?? vl,
            qtDisponivel: prod?.qt_disponivel ?? null,
            permiteSaldoNegativo: extractPermiteSaldoNegativo(prod?.raw_json),
            fatorVenda: fator,
            rawProduto: raw,
            fotoUri: prod?.foto_local || prod?.foto_url || null,
            cdCondicaoPreco:
              it.cdCondicaoPreco != null ? Number(it.cdCondicaoPreco) : null,
            condicaoPrecoLabel: it.condicaoPrecoLabel ?? null,
            vlMinimo: it.vlMinimo != null ? Number(it.vlMinimo) : null,
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

  // Recalcula o pricing (IPI/ST/Flex/comissão) sempre que mudam itens, condição
  // ou contexto fiscal. Mantém a UX: se o motor não estiver disponível
  // (parâmetros não sincronizados), os itens permanecem sem `pricing`.
  useEffect(() => {
    if (!user || !empresaParams) return;
    let cancelado = false;
    (async () => {
      const novos: Array<{ cdProduto: number; pricing: ResultadoCalculoItem | null }> = [];
      for (const it of itens) {
        if (it.qt <= 0 || !cdTabelaPrecoResolvida) {
          novos.push({ cdProduto: it.cdProduto, pricing: null });
          continue;
        }
        const ufEmpresa = empresaParams.cdEstado ?? user.cdEstado ?? null;
        // O JOIN em listClientes (`SELECT c.*, ci.cd_estado AS estado`)
        // expõe a UF como `cliente.estado` (sigla TEXT, ex.: "SC"). Antes
        // líamos `cliente.uf`, que não existe — resultado: ufCliente
        // sempre null e v_pr_icms_saida zerado por falta do imposto_uf.
        const ufCliente =
          (cliente as any)?.estado != null
            ? String((cliente as any).estado)
            : null;
        const contexto: ContextoCalculoItem = {
          empresa: empresaParams,
          representante: representanteEngine,
          cliente: cliente
            ? {
                cdCliente: cliente.cd_cliente,
                cdEstado: ufCliente,
                cdTabelaPreco: (cliente as any).cd_tabela_preco ?? null,
                tpClienteVenda:
                  ((cliente as any).tp_cliente_venda as 'C' | 'I' | 'R') ?? 'C',
              }
            : null,
          ufEmpresa,
          ufCliente,
          cdTabelaPreco: cdTabelaPrecoResolvida,
          cdCondicaoPreco: it.cdCondicaoPreco ?? null,
          cdCondicaoPagto: condicaoSel?.cd_condicao ?? null,
          hoje: new Date(),
        };
        try {
          const resultado = await calcularItem({
            produto: {
              cdProduto: it.cdProduto,
              dsProduto: it.descricao,
              cdImposto: it.rawProduto?.cdImposto ?? null,
              cdSituacaoTributaria: it.rawProduto?.cdSituacaoTributaria ?? null,
              prIcms: Number(it.rawProduto?.prIcms ?? 0),
              prIpi: Number(it.rawProduto?.prIpi ?? 0),
              prMargemSubstituicao: Number(it.rawProduto?.prMargemSubstituicao ?? 0),
              prReducaoIcms: Number(it.rawProduto?.prReducaoIcms ?? 0),
              vlCreditoSubstituicao: Number(it.rawProduto?.vlCreditoSubstituicao ?? 0),
              idGeraFlex: (it.rawProduto?.idGeraFlex ?? 'S') as 'S' | 'N',
              idOrigemProduto: String(it.rawProduto?.idOrigemProduto ?? '0'),
              prComissao: Number(it.rawProduto?.prComissao ?? 0),
              vlCusto: 0,
            },
            qt: it.qt,
            contexto,
            vlUnitarioManual:
              it.vlUnitario !== it.vlUnitarioOriginal ? it.vlUnitario : undefined,
            holdingId: user.holdingId,
          });
          novos.push({ cdProduto: it.cdProduto, pricing: resultado });
        } catch (err) {
          console.warn('calcularItem falhou', err);
          novos.push({ cdProduto: it.cdProduto, pricing: null });
        }
      }
      if (cancelado) return;
      setItens((prev) =>
        prev.map((it) => {
          const novo = novos.find((n) => n.cdProduto === it.cdProduto);
          if (!novo) return it;
          // Quando o vendedor NÃO editou manualmente o preço (vlUnitario ===
          // vlUnitarioOriginal), sincronizamos com o resultado do motor —
          // assim o que aparece no item é exatamente o `vlUnitarioFinal` do
          // trace. Antes esse alinhamento não existia e o item podia ficar
          // travado no `vlValor` da condição (sem fórmula/condicao pagto
          // aplicadas), divergindo do trace.
          const novoUnit = novo.pricing?.vlUnitario ?? null;
          const editouManual = it.vlUnitario !== it.vlUnitarioOriginal;
          if (
            !editouManual &&
            novoUnit != null &&
            novoUnit > 0 &&
            novoUnit !== it.vlUnitario
          ) {
            return {
              ...it,
              pricing: novo.pricing,
              vlUnitario: novoUnit,
              vlUnitarioOriginal: novoUnit,
              vlInput: undefined,
            };
          }
          return { ...it, pricing: novo.pricing };
        }),
      );
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    itens
      .map((i) => `${i.cdProduto}:${i.qt}:${i.vlUnitario}:${i.cdCondicaoPreco ?? ''}`)
      .join('|'),
    cdTabelaPrecoResolvida,
    condicaoSel?.cd_condicao,
    cliente?.cd_cliente,
    empresaParams?.cdEmpresa,
    representanteEngine?.cdRepresentante,
  ]);

  const totaisFiscais = useMemo(() => {
    let totalIpi = 0;
    let totalSt = 0;
    let totalFlex = 0;
    for (const it of itens) {
      if (!it.pricing) continue;
      totalIpi += it.pricing.vlIpi;
      totalSt += it.pricing.vlSt;
      totalFlex += it.pricing.vlFlex;
    }
    return {
      totalIpi: round2(totalIpi),
      totalSt: round2(totalSt),
      totalFlex: round2(totalFlex),
    };
  }, [itens]);

  const exibirIpi = empresaParams?.idDestacaIpi === 'S' && totaisFiscais.totalIpi > 0;
  const exibirSt =
    (empresaParams?.idSubstitutoTributarioIcms === 'S' ||
      empresaParams?.idCalculaSubstituicaoTributariaSempre === 'S') &&
    totaisFiscais.totalSt > 0;

  const condicaoConfig = useMemo<CondicaoConfig>(() => {
    if (!condicaoSel) return { itens: [], prDesconto: 0 };
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
      prDesconto: Number(parsed?.prDesconto) || 0,
    };
  }, [condicaoSel]);

  const totalComAjuste = useMemo(() => {
    const fator = 1 - (condicaoConfig.prDesconto || 0) / 100;
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
    // Fator > 0: quantidade inicial e passo = fator. Fator 0: inicia em 1,
    // decimais livres, botões +/- em passos de 1.
    const fator = extractFatorVenda(p.fator_venda, p.raw_json);
    const passo = passoIncrementoQtd(fator);
    if (exist) {
      const nova = exist.qt + passo;
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
      if (!permite && disponivel != null && disponivel < passo) {
        Alert.alert(
          'Estoque insuficiente',
          `O produto "${p.descricao}" possui apenas ${disponivel} em estoque.`,
        );
        return;
      }
      let raw: any = null;
      try {
        raw = p.raw_json ? JSON.parse(p.raw_json) : null;
      } catch {
        raw = null;
      }
      const vl = p.vl_venda ?? 0;
      setItens((prev) => [
        ...prev,
        {
          cdProduto: p.cd_produto,
          descricao: p.descricao ?? `Produto ${p.cd_produto}`,
          qt: passo,
          vlUnitario: vl,
          vlUnitarioOriginal: vl,
          qtDisponivel: disponivel,
          permiteSaldoNegativo: permite,
          fatorVenda: fator,
          fotoUri: p.foto_local || p.foto_url || null,
          rawProduto: raw,
        },
      ]);
      // Carrega as condições de preço aplicáveis ao produto e seleciona uma
      // padrão automaticamente (espelha o legado, que sempre tem uma condição
      // pré-selecionada no spinner ao adicionar item).
      (async () => {
        const opts = await carregarCondicoesPreco(p.cd_produto, passo, raw);
        if (!opts.length) return;
        // Preferência: primeira condição não-promocional não-últimaVenda; se
        // não houver, qualquer uma. Mantém o vlValor da condição como mínimo.
        const padrao =
          opts.find((o) => !o.idPromocao && !o.idUltimaVenda) ?? opts[0];
        selecionarCondicaoPreco(p.cd_produto, padrao);
      })();
    }
  }

  // `textoDigitado` preserva o que o vendedor está digitando (ex.: "2,")
  // enquanto o parse ainda não tem a casa decimal. Chamadas dos botões +/-
  // não passam texto, o que limpa o transitório e volta ao valor normalizado.
  function alterarQtd(cdProduto: number, novaQtd: number, textoDigitado?: string) {
    setItens((prev) =>
      prev.map((it) => {
        if (it.cdProduto !== cdProduto) return it;
        const fator = it.fatorVenda;
        const qtd =
          textoDigitado === undefined ? snapQtToFator(novaQtd, fator) : novaQtd;
        if (qtd <= 0) return { ...it, qt: 0, qtInput: textoDigitado };
        if (
          !it.permiteSaldoNegativo &&
          it.qtDisponivel != null &&
          qtd > it.qtDisponivel
        ) {
          Alert.alert(
            'Estoque insuficiente',
            `O produto "${it.descricao}" possui apenas ${it.qtDisponivel} em estoque.`,
          );
          return { ...it, qtInput: undefined };
        }
        return { ...it, qt: qtd, qtInput: textoDigitado };
      }),
    );
  }

  // Blur: normaliza ao fator de venda quando > 0 (ex.: 13 → 10; 2,23 → 2,2).
  function finalizarQtdBlur(cdProduto: number) {
    setItens((prev) =>
      prev.map((it) => {
        if (it.cdProduto !== cdProduto) return it;
        const fator = it.fatorVenda;
        let snapped = snapQtToFator(it.qt, fator);
        if (
          !it.permiteSaldoNegativo &&
          it.qtDisponivel != null &&
          snapped > it.qtDisponivel
        ) {
          if (fator > 0) {
            const maxSteps = Math.floor(it.qtDisponivel / fator + 1e-9);
            snapped = roundQt(maxSteps * fator, fator);
          } else {
            snapped = roundQtLivre(it.qtDisponivel);
          }
          if (snapped > 0) {
            Alert.alert(
              'Estoque insuficiente',
              `Quantidade ajustada ao estoque disponível (${snapped}).`,
            );
          }
        }
        return { ...it, qt: snapped, qtInput: undefined };
      }),
    );
  }

  /**
   * Atualiza `vlUnitario` durante a digitação (onChangeText). NÃO valida o
   * mínimo aqui: validar a cada tecla impede o vendedor de digitar valores
   * de forma natural (ex.: ao digitar "120" o "1" sozinho seria menor que
   * o mínimo e a trava pisaria no mín). A validação do modo "A" do legado
   * é feita em `validarPrecoBlur` quando o input perde foco.
   */
  function alterarPreco(cdProduto: number, vl: number, textoDigitado?: string) {
    const modo = empresaParams?.idPermiteAlterarValorProdutoPalm ?? 'S';
    if (modo === 'N') return; // readonly: ignora alterações
    setItens((prev) =>
      prev.map((it) =>
        it.cdProduto === cdProduto
          ? { ...it, vlUnitario: vl, vlInput: textoDigitado }
          : it,
      ),
    );
  }

  /**
   * Validação do legado (modelo03 PedidoTabActivity:2972-2990): no modo
   * "A" (somente aumentar), se o vendedor terminar a edição com valor
   * menor que `vlMinimo` (= vl_valor da condição de preço selecionada),
   * pisa no mínimo e exibe o aviso. Disparado em `onEndEditing` (blur).
   */
  function validarPrecoBlur(cdProduto: number) {
    const modo = empresaParams?.idPermiteAlterarValorProdutoPalm ?? 'S';
    const prDescontoMax = resolvePrDescontoMax(user?.prDescontoMax);
    setItens((prev) =>
      prev.map((it) => {
        if (it.cdProduto !== cdProduto) return it;
        let next = it;

        if (
          modo === 'A' &&
          it.vlMinimo != null &&
          it.vlUnitario < it.vlMinimo
        ) {
          Alert.alert(
            'Valor abaixo do mínimo',
            `Permitido somente alterar para valores superiores a ${fmtMoney(
              it.vlMinimo,
            )}.`,
          );
          next = { ...it, vlUnitario: it.vlMinimo, vlInput: undefined };
        } else if (it.vlInput === undefined) {
          return it;
        } else {
          next = { ...it, vlInput: undefined };
        }

        const editadoManual = next.vlUnitario !== next.vlUnitarioOriginal;
        const descontoMax = validacaoDescontoMaxUsuarioPreco({
          prDescontoMax,
          vlReferencia: next.vlUnitarioOriginal,
          vlUnitario: next.vlUnitario,
          editadoManualmente: editadoManual,
        });
        if (!descontoMax.ok && descontoMax.vlMinimo > 0) {
          Alert.alert(
            'Desconto máximo',
            mensagemDescontoPrecoAjustado(prDescontoMax),
          );
          return { ...next, vlUnitario: descontoMax.vlMinimo };
        }

        return next;
      }),
    );
  }

  /**
   * Carrega a lista de condições de preço aplicáveis a um produto e calcula
   * o `vlValor` de cada uma com o motor — espelha
   * `PedidoTabActivity.calculaInformacoes_*` do legado. Usa cache em memória
   * para não recalcular toda vez que o vendedor abre o picker.
   */
  async function carregarCondicoesPreco(
    cdProduto: number,
    qt: number,
    rawOverride?: any,
  ) {
    if (!user || !empresaParams || !cdTabelaPrecoResolvida) return [];
    const cacheKey =
      `${cdProduto}|${qt}|${cdTabelaPrecoResolvida}` +
      `|${condicaoSel?.cd_condicao ?? ''}|${cliente?.cd_cliente ?? ''}`;
    if (condicoesPrecoCache[cacheKey]) return condicoesPrecoCache[cacheKey];
    try {
      const tpi = await findTabelaPrecoItem(
        cdTabelaPrecoResolvida,
        cdProduto,
        user.holdingId,
      );
      const precoTabela = tpi
        ? {
            cdTabelaPreco: tpi.cd_tabela_preco,
            cdProduto: tpi.cd_produto,
            vlVenda: Number(tpi.vl_venda ?? 0),
            vlVendaAtacado: Number(tpi.vl_venda_atacado ?? 0),
            vlPromocao: Number(tpi.vl_promocao ?? 0),
            vlPromocaoAprazo: Number(tpi.vl_promocao_aprazo ?? 0),
            dtPromocaoInicio: tpi.dt_promocao_inicio,
            dtPromocaoFim: tpi.dt_promocao_fim,
            vlCusto: Number(tpi.vl_custo ?? 0),
            prIpi: Number(tpi.pr_ipi ?? 0),
            prDesconto: Number(tpi.pr_desconto ?? 0),
            prSubstituicao: Number(tpi.pr_substituicao ?? 0),
            prMargemLucro: Number(tpi.pr_margem_lucro ?? 0),
            prMargemExtra: Number(tpi.pr_margem_extra ?? 0),
            prAcrescimoFinanceiro: Number(tpi.pr_acrescimo_financeiro ?? 0),
            vlCustoSubstituicao: Number(tpi.vl_custo_substituicao ?? 0),
            vlIcmsSubstituicao: Number(tpi.vl_icms_substituicao ?? 0),
            vlCustoImportacao: Number(tpi.vl_custo_importacao ?? 0),
            vlCustoContabil: Number(tpi.vl_custo_contabil ?? 0),
            vlAquisicao: Number(tpi.vl_aquisicao ?? 0),
            vlBonificacao: Number(tpi.vl_bonificacao ?? 0),
            vlCustoContabilNf: Number(tpi.vl_custo_contabil_nf ?? 0),
            vlCustoContabilMedio: Number(tpi.vl_custo_contabil_medio ?? 0),
          }
        : null;
      const ufEmpresa = empresaParams.cdEstado ?? user.cdEstado ?? null;
      // Mesma resolução de UF do useEffect — vem do JOIN com cidade.
      const ufCliente =
        (cliente as any)?.estado != null
          ? String((cliente as any).estado)
          : null;
      // Monta a `ProdutoEngine` para que o orquestrador
      // (`calcularItem`) consiga resolver alíquotas/imposto_uf antes da
      // fórmula. Sem isso o `v_pr_icms_saida` ficaria 0 (caso real
      // observado: lookup de imposto_uf nunca acontecia neste caminho).
      const raw = rawOverride
        ?? itens.find((i) => i.cdProduto === cdProduto)?.rawProduto
        ?? null;
      const produtoEng = {
        cdProduto,
        dsProduto: raw?.dsProduto ?? `Produto ${cdProduto}`,
        cdImposto: raw?.cdImposto ?? null,
        cdSituacaoTributaria: raw?.cdSituacaoTributaria ?? null,
        prIcms: Number(raw?.prIcms ?? 0),
        prIpi: Number(raw?.prIpi ?? 0),
        prMargemSubstituicao: Number(raw?.prMargemSubstituicao ?? 0),
        prReducaoIcms: Number(raw?.prReducaoIcms ?? 0),
        vlCreditoSubstituicao: Number(raw?.vlCreditoSubstituicao ?? 0),
        idGeraFlex: (raw?.idGeraFlex ?? 'S') as 'S' | 'N',
        idOrigemProduto: String(raw?.idOrigemProduto ?? '0'),
        prComissao: Number(raw?.prComissao ?? 0),
        vlCusto: 0,
      };
      const opts = await listarCondicoesPrecoProduto({
        produto: produtoEng,
        contexto: {
          empresa: empresaParams,
          representante: representanteEngine,
          cliente: cliente
            ? {
                cdCliente: cliente.cd_cliente,
                cdEstado: ufCliente,
                cdTabelaPreco: (cliente as any).cd_tabela_preco ?? null,
                tpClienteVenda:
                  ((cliente as any).tp_cliente_venda as 'C' | 'I' | 'R') ?? 'C',
              }
            : null,
          ufEmpresa,
          ufCliente,
          cdTabelaPreco: cdTabelaPrecoResolvida,
          cdCondicaoPagto: condicaoSel?.cd_condicao ?? null,
          hoje: new Date(),
        },
        precoTabela,
        qt: Math.max(qt, 1),
        holdingId: user.holdingId,
      });
      setCondicoesPrecoCache((prev) => ({ ...prev, [cacheKey]: opts }));
      return opts;
    } catch (err) {
      console.warn('Falha ao carregar condições de preço:', err);
      return [];
    }
  }

  function selecionarCondicaoPreco(cdProduto: number, opt: CondicaoPrecoOpt) {
    setItens((prev) =>
      prev.map((it) => {
        if (it.cdProduto !== cdProduto) return it;
        // Atualiza preço para o vlValor da condição selecionada e fixa o mínimo.
        return {
          ...it,
          cdCondicaoPreco: opt.cdCondicaoPreco,
          condicaoPrecoLabel: opt.descricao,
          vlMinimo: opt.vlValor,
          vlUnitario: opt.vlValor,
          vlUnitarioOriginal: opt.vlValor,
          vlInput: undefined,
        };
      }),
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

    const itensNorm = itens.map((it) => ({
      ...it,
      qt: snapQtToFator(it.qt, it.fatorVenda),
      qtInput: undefined,
    }));
    if (itensNorm.some((n, i) => n.qt !== itens[i].qt)) {
      setItens(itensNorm);
      return Alert.alert(
        'Quantidade ajustada',
        'Algumas quantidades foram ajustadas ao fator de venda do produto. Verifique e salve novamente.',
      );
    }
    if (itensNorm.some((it) => it.qt <= 0)) {
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

    // Validações do motor de precificação (variação de preço por item + flex
    // do representante). Só rodam quando os parâmetros estão disponíveis;
    // caso contrário caímos no comportamento atual sem essas regras.
    if (empresaParams) {
      for (const it of itens) {
        const variacao = validacaoVariacaoPreco({
          empresa: empresaParams,
          representante: representanteEngine,
          produto: {
            cdProduto: it.cdProduto,
            prIcms: Number(it.rawProduto?.prIcms ?? 0),
            vlCusto: 0,
          },
          precoTabela: it.rawProduto
            ? {
                cdTabelaPreco: cdTabelaPrecoResolvida ?? 0,
                cdProduto: it.cdProduto,
                vlVenda: it.vlUnitarioOriginal,
                vlCusto: 0,
              }
            : null,
          vlUnitario: it.vlUnitario,
        });
        if (!variacao.ok) {
          return Alert.alert(
            `Item "${it.descricao}"`,
            variacao.motivo ?? 'Variação de preço fora do permitido.',
          );
        }

        const editadoManual = it.vlUnitario !== it.vlUnitarioOriginal;
        const descontoMax = validacaoDescontoMaxUsuarioPreco({
          prDescontoMax: user.prDescontoMax,
          vlReferencia: it.vlUnitarioOriginal,
          vlUnitario: it.vlUnitario,
          editadoManualmente: editadoManual,
        });
        if (!descontoMax.ok) {
          return Alert.alert(
            `Item "${it.descricao}"`,
            descontoMax.motivo ?? 'Preço unitário fora do limite permitido.',
          );
        }
      }

      if (representanteEngine) {
        const flex = await validacaoFlex({
          representante: representanteEngine,
          holdingId: user.holdingId,
          vlVenda: total,
          vlDescontoConcedido: Math.max(0, -totaisFiscais.totalFlex),
          vlAcrescimoConcedido: Math.max(0, totaisFiscais.totalFlex),
        });
        if (!flex.ok) {
          return Alert.alert('Saldo Flex', flex.motivo ?? 'Saldo Flex insuficiente.');
        }
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

      const prevendaItem = itensNorm.map((it) => ({
        cdProduto: it.cdProduto,
        qtProduto: it.qt,
        vlCusto: 0,
        vlUnitario: it.vlUnitario,
        vlDesconto: 0,
        prComissao: it.pricing?.prComissao ?? 0,
        vlAcrescimo: 0,
        cdFuncionario: user.userId,
        qtEntregaSeparacao: 0,
        qtEntregaConferido: 0,
        idProdutoPromocao: 'N',
        qtDevolvido: 0,
        vlPromocao: 0,
        cdCondicaoPreco: it.cdCondicaoPreco ?? null,
        // Operacional não-fiscal — controla o débito de saldo flex no ERP.
        vlFlex: it.pricing?.vlFlex ?? 0,
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

      // Percentuais: o desconto prioriza o cadastro da condição. O acréscimo
      // da condição de pagamento NÃO gera ajuste no total (entra no preço
      // unitário via fórmula); só existe vlAcrescimoTotal quando o usuário
      // editou parcelas manualmente acima do total — nesse caso recalcula o %
      // efetivo para manter o registro consistente.
      const prDescontoCfg = condicaoConfig.prDesconto || 0;
      const prAcrescimo =
        vlAcrescimoTotal > 0 && vlBrutoSalvar > 0
          ? round2((vlAcrescimoTotal / vlBrutoSalvar) * 100)
          : 0;
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
        // Rastreabilidade comercial + saldo flex consolidado (motor mobile).
        // Valores nulos/zero não impactam o ERP antigo (defaults preservam).
        cdTabelaPreco: cdTabelaPrecoResolvida,
        cdCondicaoPreco: null,
        vlFlexTotal: totaisFiscais.totalFlex,
        cdRepresentante: user.cdRepresentante ?? null,
      };

      const displayPayload = {
        condicaoLabel: condicaoSel.descricao,
        observacao: obs.trim() || null,
        itens: itensNorm.map((it) => ({
          cdProduto: it.cdProduto,
          descricao: it.descricao,
          qt: it.qt,
          vlUnitario: it.vlUnitario,
          vlTotal: round2(it.qt * it.vlUnitario),
          cdCondicaoPreco: it.cdCondicaoPreco ?? null,
          condicaoPrecoLabel: it.condicaoPrecoLabel ?? null,
          vlMinimo: it.vlMinimo ?? null,
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
          {cliente
            ? `${cliente.nome ?? `Cliente #${cliente.cd_cliente}`} (${cliente.cd_cliente})`
            : 'Selecionar cliente...'}
        </Text>
      </Pressable>

      <Text style={styles.label}>Tabela de preço</Text>
      <Pressable
        style={[styles.field, !tabelaEditavel && styles.fieldDisabled]}
        onPress={() => {
          if (tabelaEditavel) setTabPickerOpen(true);
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text
              style={cdTabelaPrecoResolvida ? styles.value : styles.placeholder}
            >
              {cdTabelaPrecoResolvida
                ? `#${cdTabelaPrecoResolvida}${tabelaPrecoDesc ? ` • ${tabelaPrecoDesc}` : ''}`
                : 'Sem tabela de preço definida'}
            </Text>
            {!tabelaEditavel && (
              <Text style={styles.subtle}>
                <Ionicons name="lock-closed" size={11} color="#64748b" />{' '}
                Definida automaticamente pela configuração
              </Text>
            )}
          </View>
          {tabelaEditavel && (
            <Ionicons name="chevron-forward" size={20} color="#64748b" />
          )}
        </View>
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
              <View style={styles.itemHeaderRow}>
                {it.fotoUri && (
                  <Pressable
                    onPress={() => setFotoExpandidaFor(it.cdProduto)}
                    hitSlop={6}
                  >
                    <Image
                      source={{ uri: it.fotoUri }}
                      style={styles.itemThumb}
                    />
                  </Pressable>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.value}>
                    {it.descricao} ({it.cdProduto})
                  </Text>
                  {it.qtDisponivel != null && (
                    <Text style={styles.subtle}>
                      Estoque: {it.qtDisponivel}
                      {it.permiteSaldoNegativo ? ' (permite negativo)' : ''}
                    </Text>
                  )}
                </View>
              </View>
              <View style={styles.itemRow}>
                <View style={{ flex: 1.7 }}>
                  <Text style={styles.itemLbl}>Qtd</Text>
                  <View style={styles.qtdBox}>
                    <Pressable
                      style={styles.qtdBtn}
                      onPress={() => {
                        const passo = passoIncrementoQtd(it.fatorVenda);
                        const base =
                          it.fatorVenda > 0
                            ? snapQtToFator(it.qt, it.fatorVenda)
                            : it.qt;
                        alterarQtd(it.cdProduto, Math.max(0, base - passo));
                      }}
                    >
                      <Ionicons name="remove" size={18} color="#fff" />
                    </Pressable>
                    <TextInput
                      style={styles.qtdInput}
                      keyboardType="decimal-pad"
                      value={it.qtInput ?? formatQtDisplay(it.qt, it.fatorVenda)}
                      onChangeText={(t) =>
                        alterarQtd(
                          it.cdProduto,
                          Number(t.replace(',', '.')) || 0,
                          t,
                        )
                      }
                      onEndEditing={() => finalizarQtdBlur(it.cdProduto)}
                      onBlur={() => finalizarQtdBlur(it.cdProduto)}
                      selectTextOnFocus
                    />
                    <Pressable
                      style={styles.qtdBtn}
                      onPress={() => {
                        const passo = passoIncrementoQtd(it.fatorVenda);
                        const base =
                          it.fatorVenda > 0
                            ? snapQtToFator(it.qt, it.fatorVenda)
                            : it.qt;
                        alterarQtd(it.cdProduto, base + passo);
                      }}
                    >
                      <Ionicons name="add" size={18} color="#fff" />
                    </Pressable>
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemLbl}>
                    Vl. unit.{precoBloqueado || precoSomenteAumenta ? ' 🔒' : ''}
                  </Text>
                  <TextInput
                    style={[
                      styles.itemInput,
                      (precoBloqueado || precoReadonly) && {
                        backgroundColor: '#e2e8f0',
                        color: '#475569',
                      },
                    ]}
                    keyboardType="decimal-pad"
                    editable={!precoBloqueado && !precoReadonly}
                    value={it.vlInput ?? String(it.vlUnitario)}
                    onChangeText={(t) =>
                      alterarPreco(
                        it.cdProduto,
                        Number(t.replace(',', '.')) || 0,
                        t,
                      )
                    }
                    onEndEditing={() => validarPrecoBlur(it.cdProduto)}
                    onBlur={() => validarPrecoBlur(it.cdProduto)}
                    selectTextOnFocus
                  />
                  {precoSomenteAumenta && it.vlMinimo != null && (
                    <Text style={styles.subtle}>
                      Mínimo {fmtMoney(it.vlMinimo)} (somente aumentar)
                    </Text>
                  )}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.itemLbl}>Total</Text>
                  <Text style={styles.itemTotal}>
                    {fmtMoney(it.qt * it.vlUnitario)}
                  </Text>
                </View>
              </View>
              {/* Condição de preço por item — espelha o spinner por linha do
                  legado. Pré-selecionada ao adicionar o produto; pode ser
                  trocada pelo vendedor a qualquer momento. */}
              <Pressable
                style={styles.condicaoPrecoBtn}
                onPress={() => {
                  carregarCondicoesPreco(it.cdProduto, it.qt);
                  setCondPrecoOpenFor(it.cdProduto);
                }}
              >
                <Ionicons name="pricetag-outline" size={14} color="#1e3a8a" />
                <Text style={styles.condicaoPrecoTxt}>
                  {it.cdCondicaoPreco
                    ? `Cond. preço #${it.cdCondicaoPreco}${
                        it.condicaoPrecoLabel ? ` • ${it.condicaoPrecoLabel}` : ''
                      }${
                        it.vlMinimo != null
                          ? ` • ${precoSomenteAumenta ? 'mín ' : ''}${fmtMoney(it.vlMinimo)}`
                          : ''
                      }`
                    : 'Selecionar condição de preço'}
                </Text>
                <Ionicons name="chevron-forward" size={14} color="#64748b" />
              </Pressable>
            </View>
            <View style={styles.itemActions}>
              <Pressable
                onPress={() => setPrecoDetalheFor(it.cdProduto)}
                style={styles.infoBtn}
                hitSlop={10}
              >
                <Ionicons name="information-circle-outline" size={20} color="#1e3a8a" />
              </Pressable>
              <Pressable
                onPress={() => removerItem(it.cdProduto)}
                style={styles.removeBtn}
                hitSlop={10}
              >
                <Ionicons name="trash" size={18} color="#dc2626" />
              </Pressable>
            </View>
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
      {condicaoConfig.prDesconto > 0 && (
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>
            Desconto ({condicaoConfig.prDesconto}%)
          </Text>
          <Text style={styles.totalValue}>{fmtMoney(totalComAjuste - total)}</Text>
        </View>
      )}
      {exibirIpi && (
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>IPI (estimativa)</Text>
          <Text style={styles.totalValue}>{fmtMoney(totaisFiscais.totalIpi)}</Text>
        </View>
      )}
      {exibirSt && (
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>Substituição Tributária (estimativa)</Text>
          <Text style={styles.totalValue}>{fmtMoney(totaisFiscais.totalSt)}</Text>
        </View>
      )}
      {totaisFiscais.totalFlex !== 0 && (
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>Saldo Flex consumido</Text>
          <Text style={styles.totalValue}>{fmtMoney(totaisFiscais.totalFlex)}</Text>
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
      <TabelaPrecoPicker
        visible={tabPickerOpen}
        onClose={() => setTabPickerOpen(false)}
        onSelect={(t) => setTabelaPrecoManual(t)}
        selectedId={cdTabelaPrecoResolvida ?? null}
        holdingId={user!.holdingId}
      />
      {(() => {
        const it =
          fotoExpandidaFor != null
            ? itens.find((i) => i.cdProduto === fotoExpandidaFor)
            : null;
        return (
          <FotoProdutoModal
            visible={fotoExpandidaFor != null}
            uri={it?.fotoUri ?? null}
            descricao={it?.descricao}
            onClose={() => setFotoExpandidaFor(null)}
          />
        );
      })()}
      {precoDetalheFor != null && (() => {
        const it = itens.find((i) => i.cdProduto === precoDetalheFor);
        if (!it) return null;
        return (
          <PrecoDetalheModal
            visible
            onClose={() => setPrecoDetalheFor(null)}
            produto={{ cdProduto: it.cdProduto, descricao: it.descricao }}
            qt={it.qt}
            vlUnitarioAtual={it.vlUnitario}
            vlUnitarioOriginal={it.vlUnitarioOriginal}
            pricing={it.pricing}
            cdTabelaPreco={cdTabelaPrecoResolvida}
            tabelaPrecoDesc={tabelaPrecoDesc}
            vlMinimo={it.vlMinimo}
          />
        );
      })()}
      <CondicaoPrecoPicker
        visible={condPrecoOpenFor != null}
        options={(() => {
          if (condPrecoOpenFor == null || !cdTabelaPrecoResolvida) return [];
          const it = itens.find((i) => i.cdProduto === condPrecoOpenFor);
          const qtAtual = it?.qt ?? 1;
          const k =
            `${condPrecoOpenFor}|${qtAtual}|${cdTabelaPrecoResolvida}` +
            `|${condicaoSel?.cd_condicao ?? ''}|${cliente?.cd_cliente ?? ''}`;
          return condicoesPrecoCache[k] ?? [];
        })()}
        selectedId={
          condPrecoOpenFor != null
            ? (itens.find((i) => i.cdProduto === condPrecoOpenFor)
                ?.cdCondicaoPreco ?? null)
            : null
        }
        onClose={() => setCondPrecoOpenFor(null)}
        onSelect={(opt) => {
          if (condPrecoOpenFor != null) {
            selecionarCondicaoPreco(condPrecoOpenFor, opt);
          }
        }}
      />
    </KeyboardAwareScreen>
  );
}

// Fator de venda do produto: prefere a coluna `fator_venda` (populada no
// sync); cai para o `fatorVenda` do raw_json. Valor 0 = sem restrição de
// múltiplo (quantidade livre, inicia em 1). Ausente no cadastro → 0.
function extractFatorVenda(
  fatorColuna?: number | null,
  rawJson?: string | null,
): number {
  if (fatorColuna != null && Number.isFinite(Number(fatorColuna))) {
    const f = Number(fatorColuna);
    if (f >= 0) return f;
  }
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      if (parsed?.fatorVenda != null && Number.isFinite(Number(parsed.fatorVenda))) {
        const f = Number(parsed.fatorVenda);
        if (f >= 0) return f;
      }
    } catch {
      // raw_json inválido → sem fator.
    }
  }
  return 0;
}

/** Passo dos botões +/- e quantidade inicial quando fator = 0. */
function passoIncrementoQtd(fator: number): number {
  return fator > 0 ? fator : 1;
}

function fatorDecimals(fator: number): number {
  if (Number.isInteger(fator)) return 0;
  const s = String(fator);
  const dot = s.indexOf('.');
  if (dot === -1) return 0;
  return s.length - dot - 1;
}

function roundQt(qt: number, fator: number): number {
  const dec = Math.max(fatorDecimals(fator), 0);
  return Number(qt.toFixed(dec));
}

/** Evita ruído de ponto flutuante sem impor múltiplo de fator. */
function roundQtLivre(qt: number): number {
  return Number(qt.toFixed(6));
}

/** Ajusta ao múltiplo do fator quando > 0; fator 0 mantém decimais livres. */
function snapQtToFator(qt: number, fator: number): number {
  if (qt <= 0) return 0;
  if (!(fator > 0)) return roundQtLivre(qt);
  const mult = Math.round(qt / fator);
  return roundQt(mult * fator, fator);
}

function formatQtDisplay(qt: number, fator: number): string {
  const v = fator > 0 ? roundQt(qt, fator) : roundQtLivre(qt);
  return String(v).replace('.', ',');
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
  fieldDisabled: {
    backgroundColor: '#f1f5f9',
    borderColor: '#e2e8f0',
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
  itemHeaderRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  itemThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  itemLbl: { fontSize: 11, color: '#64748b' },
  condicaoPrecoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    marginTop: 8,
  },
  condicaoPrecoTxt: { flex: 1, fontSize: 12, color: '#0f172a' },
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
  infoBtn: { padding: 6 },
  itemActions: { gap: 4, alignItems: 'center' },
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
    minWidth: 68,
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
