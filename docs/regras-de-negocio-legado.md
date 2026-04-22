# Regras de Negócio do App Legado (Duapi Mobile)

> Documento de referência para reimplementação no app TechBull.
> Fonte analisada: `C:\Users\User\Downloads\Fontes Android\duapimobile-v-producao-master` (pacote Java `br.com.twcom.duapi`).
> Todas as citações abaixo referem-se ao código legado, não ao código deste repositório.

---

## 1. Visão geral

O Duapi Mobile é uma aplicação Android de força de venda usada por representantes para emitir pedidos em campo, com sincronização com um backend Duapi via SOAP. A inteligência de preço/imposto/comissão roda **no cliente** (SQLite local), logo todas as fórmulas precisam ser replicadas no TechBull.

### 1.1 Entidades centrais

Os modelos estão em `duaPiMobile/src/main/java/br/com/twcom/duapi/modelo/`:

- **`Produto`** – cadastro (código, custo, `pr_ipi`, `pr_comissao`, `cd_imposto`, `id_origem_produto`, `vl_credito_substituicao`, `id_gera_flex`, etc.).
- **`Tabela_Preco_Item`** – preço base por `(cd_tabela_preco, cd_produto)`.
- **`Tabela_Preco_Promocao`** – preço promocional com janela de datas (`dt_ini`, `dt_fim`) e possível vínculo com `cd_tabela_preco`.
- **`Condicao_Preco`** – cenário comercial (`pr_acrescimo`, `id_promocao`, descrição; há o caso especial `"Última Venda"`).
- **`Condicao_Pagto`** – condição de pagamento (`pr_desconto`, `pr_acrescimo`, prazo).
- **`Condicao_Pagto_Preco`** – junção `(cd_condicao_pagto, cd_tabela_preco_condicao)` que liga condição de pagamento a cenários de preço.
- **`Produto_Desconto`** – desconto por faixa de quantidade (`qt_produto_inicio`, `qt_produto_fim`, `pr_desconto`).
- **`Imposto_Uf`** – alíquotas por `(cd_imposto, cd_estado)`: `pr_icms_interno`, `pr_icms_externo`, `pr_base_substituicao_interno/externo`, `pr_reducao_*`, `pr_pis`, `pr_cofins`.
- **`Tabela_Icms`** – ICMS interestadual por `(cd_estado_origem, cd_estado_destino)` e `id_st_diferenca_icms`.
- **`Produto_Custo_Variavel`** – variáveis nomeadas usadas em fórmulas dinâmicas por empresa.
- **`Representante`** – cadastro com `vl_saldo_flex`, `pr_flex_min`, `pr_flex_max`, `id_margem`.
- **`Flex_Movto`** / **`Representante_Saldo_Flex`** – movimentação de saldo Flex.
- **`Pedido_Venda_Pendente`** / **`Pedido_Venda_Pendente_Item`** – pedido em edição (campos extras: `pr_desconto1`, `pr_desconto2`, `vl_flex`, `vl_desconto_credito_substituicao`, `cd_tabela_preco_condicao`).
- **`Pedido_Venda`** / **`Pedido_Venda_Item`** – pedido já sincronizado (versão mais enxuta).
- **`Parametro`** – chave/valor genérico (hidratado a partir de `empresa`/`representante` no login).

### 1.2 Origem dos parâmetros

`Parametro` é uma tabela chave/valor. Os valores **são hidratados em tempo de login/menu** a partir de colunas de `empresa` e `representante` (ver `Login.java` / `Menu.java`, bloco ~1770–1825). Ou seja, no backend as regras são por empresa; no app viram lookups globais via `Repositorio.Parametro_getValue(chave)`.

---

## 2. Cálculo do preço do produto (pipeline)

### 2.1 Ideia geral

O preço de venda **não** é um único campo em `Produto`. Ele é composto dinamicamente na ordem abaixo, com múltiplas ramificações controladas por parâmetros e pela condição de preço/condição de pagamento selecionadas no cabeçalho do pedido.

### 2.2 Pipeline canônico

Arquivos-chave:
- `duaPiMobile/src/main/java/br/com/twcom/duapi/repositorio/Repositorio.java` – métodos `Produto_Valores_find` (~1883–2014), `Produto_Estoque_find` (~1627–1735), `Condicao_Pagto_Preco_Produto_Valores_find` (~2471–2481).
- `duaPiMobile/src/main/java/br/com/twcom/duapi/controle/Util.java` – `verifica_produto_desconto` (~1819–1841), `f_calcula_margem_lucro_item` (~834–975), `f_calculo_custo_parametro` (~1134–1260).
- `duaPiMobile/src/main/java/br/com/twcom/duapi/visao/pedido/modelo03/PedidoTabActivity.java` – `calculaInformacoes_getVl_unitario` (~2006–2070).

**Ordem de aplicação:**

1. **Preço base**
   - Se `condicao_preco.id_promocao = 'S'` e há registro válido em `tabela_preco_promocao` (janela `dt_ini..dt_fim`, eventualmente filtrado por `cd_tabela_preco` quando `id_utiliza_promocao_por_tabela_preco = 'S'`):
     `vl_base = tabela_preco_promocao.vl_promocao`.
   - Caso contrário: `vl_base = tabela_preco_item.vl_preco` para `(cd_tabela_preco, cd_produto)`.

2. **Crédito de substituição** (opcional)
   Quando `id_utiliza_desconto_credito_substituicao_venda = 'S'` e o regime/estado permite, subtrai o crédito cadastrado no produto:
   `vl = vl - produto.vl_credito_substituicao`.
   O valor também é registrado no item em `vl_desconto_credito_substituicao` para auditoria.

3. **Acréscimo da condição de preço**
   `vl = vl + (vl * condicao_preco.pr_acrescimo / 100)`.

4. **Desconto da condição de pagamento**
   `vl = vl - (vl * condicao_pagto.pr_desconto / 100)`, aplicado **somente se** uma das condições for verdadeira:
   - `id_utiliza_desconto_promocao_pedido_venda = 'S'`, **ou**
   - `condicao_preco.id_promocao = 'N'`.
   Ou seja: em promoções, o desconto financeiro do prazo só entra quando o parâmetro global permite.

5. **Desconto por faixa de quantidade** (`Util.verifica_produto_desconto`)

   ```java
   Produto_Desconto p_d = repositorio.Produto_Desconto_find(acd_produto, aqt_pedida);
   Double pr_desconto = (p_d != null) ? p_d.getPr_desconto() : 0d;
   avl_unitario = avl_unitario - ((avl_unitario * pr_desconto) / 100d);
   return Util.roundDouble(avl_unitario, Util_Parametro.getNr_casa_decimal_valor_venda(ctx));
   ```

   Só é aplicado quando o cenário permite (ver seção 2.3). A função retorna o unitário já arredondado pelo nº de casas decimais configurado.

6. **Arredondamento final**
   `vl = round(vl, Util_Parametro.getNr_casa_decimal_valor_venda())` (padrão do produto = 2, mas configurável).

7. **Caso especial "Última Venda"**
   Se `condicao_preco.ds_condicao_preco = "Última Venda"`, o unitário **não passa pelo pipeline acima**. Ele vem diretamente de `condicao_preco.vl_valor` carregado na listagem (ver `PedidoTabActivity.calculaInformacoes_getVl_unitario` ~2006–2070). Útil para replicar o último preço praticado ao mesmo cliente.

8. **Motor de fórmula por empresa**
   Quando `empresa.ds_funcao_calculo_preco_venda` ou `ds_funcao_calculo_margem_lucro` estão preenchidos, `Util.f_calculo_custo_parametro` e `Util.f_calcula_margem_lucro_item` montam SQL dinâmico interpolando nomes de coluna de `produto_custo_variavel` e valores de custo/imposto/comissão. Isso **substitui** ou ajusta o resultado do pipeline em empresas com regras contábeis customizadas.
   **Atenção na reimplementação**: é injeção de nome de coluna em SQL – qualquer porte precisa de whitelist.

### 2.3 Exceções observadas

- **`Produto_Valores_find`** fixa `calcula_produto_desconto = false` no início. Isso significa que, dentro desse método, o passo (5) não é aplicado. O desconto por faixa é injetado em outro lugar – em `Util.verifica_produto_desconto`, chamado pelo fluxo Flex / `calculaInformacoes_getVl_unitario`.
- **`Condicao_Pagto_Preco_Produto_Valores_find`** (usado quando `id_utiliza_condicao_pagto_ligacao_condicao_preco = 'S'`) substitui o cálculo por:
  `vl = tabela_preco_item.vl_preco + (tabela_preco_item.vl_preco * apr_acrescimo / 100)` (ou a promoção, se aplicável). O acréscimo aqui vem da condição de pagamento escolhida, e não da condição de preço.

### 2.4 Pseudocódigo de referência

```text
funcao calcular_preco(produto, tabelaPreco, condPreco, condPagto, qt, contexto):
    # 1. base
    se condPreco.id_promocao == 'S' e promocao_valida(produto, tabelaPreco):
        vl = promocao.vl_promocao
    senao:
        vl = tabelaPrecoItem.vl_preco

    # 2. credito ST (opcional)
    se parametro('id_utiliza_desconto_credito_substituicao_venda') == 'S' e regime_permite():
        vl -= produto.vl_credito_substituicao

    # 3. acrescimo cond. preco
    vl += vl * condPreco.pr_acrescimo / 100

    # 4. desconto cond. pagto
    se parametro('id_utiliza_desconto_promocao_pedido_venda') == 'S'
       ou condPreco.id_promocao == 'N':
        vl -= vl * condPagto.pr_desconto / 100

    # 5. desconto por faixa de quantidade
    se aplicavel(condPreco, parametro('id_utiliza_desconto_promocao_pedido_venda')):
        pd = produto_desconto_find(produto, qt)
        vl -= vl * (pd ? pd.pr_desconto : 0) / 100

    # 6. arredondamento
    vl = round(vl, parametro('nr_casa_decimal_valor_venda', 2))

    # 7. casos especiais
    se condPreco.descricao == 'Última Venda':
        vl = condPreco.vl_valor

    # 8. formula dinamica por empresa
    se empresa.ds_funcao_calculo_preco_venda:
        vl = aplicar_formula_empresa(vl, produto, custo_variaveis)

    retornar vl
```

---

## 3. Impostos

### 3.1 IPI

Cadastro: `produto.pr_ipi` (percentual).
Cálculo por linha:
`vl_ipi = qt * vl_unitario * produto.pr_ipi / 100`
(ver `PedidoTabActivity.calcula_vl_substituicao` ~1747–1749).

Inclusão no total do pedido: somente se `id_destaca_ipi = 'S'` (parâmetro).

### 3.2 ICMS e identificação de alíquotas

Função principal: `Util.f_calcula_imposto_busca_aliquota` (~2266–2407 em `Util.java`). Resumo da lógica:

1. Busca `Imposto_Uf` na origem (`produto.cd_imposto`, `cd_estado_origem`) para obter `pr_icms_interno`, `pr_base_substituicao_interno/externo`, `pr_reducao_base_substituicao_interno/externo`.
2. **Se origem == destino** (operação interna):
   - `pr_base_substituicao = pr_base_substituicao_interno`
   - `pr_icms_substituicao = pr_icms_venda` (interno de origem)
   - `pr_reducao_base_substituicao = pr_reducao_base_substituicao_interno`
3. **Se origem ≠ destino** (interestadual):
   - Usa `pr_base_substituicao_externo` e `pr_reducao_base_substituicao_externo` de origem.
   - Busca `Imposto_Uf_destino` para pegar `pr_icms_interno` (vira `pr_icms_substituicao`) e `pr_reducao_icms_interno`.
   - Se `id_utiliza_mva_externo_venda = 'S'`, `pr_base_substituicao` passa a vir do **destino** (`pr_base_substituicao_externo`).
   - Se `pr_base_substituicao > 0` mas ICMS interno do destino é 0, zera tudo (sem ST).
4. **Produto importado** em venda interestadual:
   - Se `id_origem_produto ∉ {'0','4','5'}` e `pr_icms_produto_importado_compra_venda_fora_estado > 0` e (o parâmetro `id_utiliza_reducao_icms_fora_estado = 'N'` ou não há redução interna do destino):
     `pr_icms_venda = pr_icms_produto_importado_compra_venda_fora_estado` (tipicamente 4%).
5. **Caso contrário (interestadual padrão)**:
   `pr_icms_venda = Tabela_Icms(origem, destino).pr_icms`.

A função retorna um dos percentuais conforme `atp_retorno`: `PR_ICMS_VENDA`, `PR_BASE_SUBSTITUICAO`, `PR_ICMS_SUBSTITUICAO`, `PR_REDUCAO_BASE_SUBSTITUICAO`. Há uma variante `f_calcula_imposto_busca_aliquota2` que devolve o array com os quatro de uma vez.

### 3.3 Substituição Tributária (ST)

Implementação vigente no modelo03: `Util.calcula_substituicao2` (~2200–2263). Fórmula (nomenclatura do código):

```
# redução da base (quando a empresa permite esse regime)
se regime_empresa permite reducao:
    ad_pr_base_substituicao -= ad_pr_base_substituicao * ad_pr_reducao_base_substituicao / 100
senao:
    ad_pr_reducao_base_substituicao = 0

# consumidor com ST por diferença de ICMS → zera MVA
se id_st_diferenca_icms == 'S':
    ad_pr_base_substituicao = 0

# base da ST (MVA aplicado sobre valor + IPI)
base_icms_origem = (base_item + ipi) * pr_base_substituicao / 100         # arredondado em 2 casas
base_icms_origem = base_item + ipi + base_icms_origem                      # base final

icms_origem      = base_icms_origem * pr_substituicao / 100

# para consumidor com diferença, inclui IPI na base própria
se id_tipo_cliente == 'C' e id_st_diferenca_icms == 'S':
    base_item += ipi

icms_venda = base_item * pr_icms / 100
vl_st      = max(icms_origem - icms_venda, 0)
```

O mesmo método pode retornar a **base**, a **redução** ou o **valor da ST** conforme `as_tipo_retorno` (`"B"`, `"R"` ou padrão).

Existe também a variante legada `Util.f_calcula_substituicao` (~757–831), que opera sobre `valor_total` do item em vez da base unitária e segue a mesma lógica algébrica. Na reimplementação, padronizar para `calcula_substituicao2`.

**Observação sobre FCP**: não há cálculo explícito de FCP (Fundo de Combate à Pobreza) no código analisado. Se necessário no novo app, precisará ser adicionado como nova alíquota.

### 3.4 Configuração de quem paga ST

Controlado pelos parâmetros:
- `id_substituto_tributario_icms` – empresa é substituta.
- `id_calcula_substituicao_tributaria_sempre` – força cálculo independente do cadastro do cliente.
- `id_regime_utiliza_reducao_base_substituicao` – concede redução.
- `id_utiliza_st_diferenca_icms` / `id_st_diferenca_icms` no `Tabela_Icms` – ST por diferença para consumidor final.

---

## 4. Total do pedido

Em `PedidoTabActivity.calculaTotais` (~2094–2124):

```
total_produtos    = Σ (qt_i * vl_unitario_i)
total_ipi         = Σ vl_ipi_i         # somente se id_destaca_ipi = 'S'
total_substituicao = Σ vl_st_i
total_pedido       = total_produtos + total_ipi + total_substituicao
```

IPI e ST entram **adicionados** ao total (não embutidos no `vl_unitario`). O desconto do item (`vl_desconto = pr_desconto2% sobre qt*vl_unitario`) reduz `total_produtos` antes da composição.

---

## 5. Flex, margem mínima e comissão

### 5.1 Conceito de Flex

“Flex” é o **saldo de desconto** disponível ao representante. Cada produto tem um preço esperado calculado pelo pipeline (seção 2). Quando o vendedor pratica um preço **menor**, a diferença unitária multiplicada pela quantidade consome saldo Flex do representante.

Campos relevantes:
- `representante.vl_saldo_flex` / `representante_saldo_flex.vl_saldo_flex`
- `representante.pr_flex_min`, `representante.pr_flex_max`
- `produto.id_gera_flex` – se `'N'`, o produto **não** consome Flex (valida apenas margem/desconto).
- Item do pedido: `vl_flex` (negativo quando consome).

### 5.2 Cálculo do Flex por item

Em `PedidoTabActivity.atualizaFLEX` (~1960–1990):

```
diferenca  = vl_unitario_praticado - vl_unitario_calculado
vl_flex_item = diferenca * qt_pedida
```

Valores **positivos** de `vl_flex_item` creditam saldo (preço acima do esperado); negativos debitam.

### 5.3 Validação Flex (`Util.FLEX_validacao` ~1887–1937)

Passos, nesta ordem:

1. Ajusta saldo pendente: `vl_saldo = vl_saldo + parcelas_negativas_pendentes + parcelas_negativas_rascunho + parcelas_negativas_pedido_atual`.
2. Calcula `pr_diferenca = (vl_unitario / vl_unitario_calculado - 1) * 100`.
3. **Atalho**: se `pr_diferenca * -1 == pr_desconto2` (desconto por faixa já explica a variação), aprova imediatamente.
4. Roda `variacao_preco_validacao` (ver 5.4). Se falhar, aborta.
5. Se `pr_diferenca < pr_flex_min` ou `pr_diferenca > pr_flex_max` → erro "Valor do item ultrapassou o permitido".
6. Se `diferenca * qt >= 0` (preço ≥ esperado) → aprova (não consome saldo).
7. Se `vl_saldo + diferenca*qt < 0` → erro "Saldo do FLEX não permite este desconto".

### 5.4 Margem mínima vs. desconto máximo (`Util.variacao_preco_validacao` ~1844–1885)

Controlado pelo parâmetro `id_produto_controle_variacao_preco`:

- **`M` (margem mínima)**:
  Rejeita se `vl_custo_unitario * (1 + pr_margem_minimo/100) > vl_unitario`.
  Mensagem: *"Custo do produto não permite este valor de venda devido a sua margem mínima."*
- **`D` (desconto máximo sobre tabela)**:
  Rejeita se `vl_preco_tabela * (1 - pr_margem_minimo/100) > vl_unitario`.
  Mensagem: *"Preço de tabela do produto não permite este valor de venda devido a seu percentual de desconto máximo."*

### 5.5 Comissão

Cadastro em `produto.pr_comissao`. Agregação em `Repositorio.Pedido_Venda_Sintetico_find` (~2069–2071):

```
vl_comissao_item = ((vl_unitario * qt) - vl_desconto) * produto.pr_comissao / 100
```

Parâmetros modificadores:
- `id_tipo_comissao_venda` – controla base de cálculo (bruto vs. líquido).
- `representante.id_margem` – habilita visualização/cálculo de margem por representante.
- `pr_margem_lucro_minimo` – limite visual (aviso) usado no modelo03 (`getCalculaMargemDeLucroBruta`).

---

## 6. Parâmetros de negócio relevantes

Chave/valor em `Parametro`, consultados via `Repositorio.Parametro_getValue`. Os mais utilizados nos cálculos acima:

**Precisão / arredondamento**
- `nr_casa_decimal_valor_venda` – casas decimais do preço (default 2).
- `nr_casa_decimal_quantidade` – casas decimais da quantidade.

**Controle de variação de preço**
- `id_produto_controle_variacao_preco` – `M` (margem mín.) ou `D` (desc. máx.).
- `pr_margem_lucro_minimo` / `id_margem` – margens de referência.

**Composição do preço**
- `id_utiliza_desconto_promocao_pedido_venda` – habilita desconto da cond. pagto. em cenário promocional e desconto por quantidade.
- `id_utiliza_promocao_por_tabela_preco` – filtra promoção pela tabela de preço.
- `id_utiliza_condicao_pagto_ligacao_condicao_preco` – usa `Condicao_Pagto_Preco_Produto_Valores_find`.
- `id_utiliza_desconto_credito_substituicao_venda` – subtrai crédito ST do preço.
- `id_empresa_utiliza_acrescimo_condicao_pagto` – se `N`, zera acréscimo financeiro no cálculo de custo.
- `id_bloqueia_alteracao_preco_tablet` – UX (trava edição).
- `id_ignora_tabela_preco_cliente_tablet` – UX (usa tabela do representante, não do cliente).

**Impostos e ST**
- `id_destaca_ipi` – IPI entra no total.
- `id_substituto_tributario_icms` – empresa substituta.
- `id_calcula_substituicao_tributaria_sempre` – força cálculo de ST.
- `id_regime_utiliza_reducao_base_substituicao` – concede redução na base de ST.
- `pr_icms_produto_importado_compra_venda_fora_estado` – ICMS de importação em operação interestadual (ex.: 4%).
- `id_utiliza_st_diferenca_icms` – ST por diferença de ICMS (consumidor).
- `id_utiliza_mva_externo_venda` – usa MVA externo do estado de destino.

**Motor de fórmula por empresa**
- `id_custo_agregado` – tipo de custo.
- `ds_funcao_calculo_preco_venda` – nome de coluna/função para preço.
- `ds_funcao_calculo_margem_lucro` – nome de coluna/função para margem.

**Contexto fiscal**
- `cd_estado`, `cd_empresa`, `cd_representante` – origem das operações.

---

## 7. Pontos de atenção para a reimplementação no TechBull

1. **Duas implementações de ST**: `Util.f_calcula_substituicao` (antiga, ~757–831) e `Util.calcula_substituicao2` (moderna, ~2200–2263). A segunda é a usada no fluxo principal do modelo03 – padronizar por ela.
2. **`Produto_Valores_find` desativa desconto por quantidade internamente** (`calcula_produto_desconto = false`). O desconto é aplicado fora, em `Util.verifica_produto_desconto`. Ao portar, é mais limpo unificar em um único caminho.
3. **`Pedido_Venda_Pendente_Item` tem mais campos que `Pedido_Venda_Item`** (`pr_desconto1`, `pr_desconto2`, `vl_flex`, `vl_desconto_credito_substituicao`, `cd_tabela_preco_condicao`). O novo schema precisa preservar esses campos para enviar ao backend.
4. **Fórmulas dinâmicas por empresa** (`ds_funcao_calculo_*`) montam SQL concatenando o nome recebido como coluna. Num novo app, essa lógica deve ser reescrita com whitelist/enum – nunca concatenar string direto em SQL.
5. **FCP não está implementado** no legado. Se for requisito fiscal hoje, precisa ser adicionado como campo em `Imposto_Uf` (ou novo modelo) e incluído na soma do total.
6. **“Última Venda”** é reconhecida pela **descrição** de `Condicao_Preco` (`"Última Venda"`). Isso é frágil – ao portar, preferir uma flag explícita.
7. **Saldo Flex pendente** é deduzido dinamicamente. Os itens que ainda não foram sincronizados já consomem o saldo disponível (rascunho + pendente + pedido atual). Isso precisa ser replicado para não permitir gastos duplicados.
8. **Estado da empresa hardcoded**: em trechos de `calcula_substituicao` há `gs_estado_empresa = "SC"` fixo com um `//TODO`. No port, o estado deve vir sempre da configuração da empresa.

---

## 8. Mapa das fontes

Arquivos consultados (relativos ao pacote `br.com.twcom.duapi`):

- `controle/Util.java` – núcleo das regras: preço, impostos, ST, Flex, validações, fórmulas dinâmicas.
- `controle/Util_Parametro.java` – leitura de parâmetros tipados (casas decimais, flags).
- `repositorio/Repositorio.java` – acesso SQLite: `Produto_Valores_find`, `Produto_Estoque_find`, `Condicao_Pagto_Preco_Produto_Valores_find`, `Produto_Desconto_find`, `Pedido_Venda_Sintetico_find`, `FLEX_saldo`, `Parametro_getValue`.
- `modelo/Produto.java` – campos fiscais e de negócio do produto.
- `modelo/Tabela_Icms.java` – ICMS interestadual.
- `modelo/Imposto_Uf.java` – alíquotas por UF.
- `modelo/Condicao_Preco.java` – cenário comercial (acréscimo/promoção/última venda).
- `modelo/Condicao_Pagto.java` / `modelo/Condicao_Pagto_Preco.java` / `modelo/Condicao_Pagto_Auxiliar.java` – condição de pagamento e vínculos com preço.
- `modelo/Produto_Desconto.java` – desconto por faixa de quantidade.
- `modelo/Produto_Custo_Variavel.java` – variáveis de fórmula por empresa.
- `modelo/Representante.java` / `modelo/Representante_Saldo_Flex.java` / `modelo/Flex_Movto.java` – saldos e limites Flex, comissão.
- `modelo/Pedido_Venda.java` / `modelo/Pedido_Venda_Item.java` – pedido sincronizado.
- `modelo/Pedido_Venda_Pendente.java` / `modelo/Pedido_Venda_Pendente_Item.java` – pedido em edição (campos completos: `pr_desconto1`, `pr_desconto2`, `vl_flex`, `vl_desconto_credito_substituicao`, `cd_tabela_preco_condicao`).
- `modelo/Empresa.java` – `ds_funcao_calculo_preco_venda`, `ds_funcao_calculo_margem_lucro`, regime.
- `modelo/Parametro.java` – chave/valor.
- `visao/pedido/modelo03/PedidoTabActivity.java` – fluxo de pedido mais completo (cálculo de totais, IPI, ST, atualização de Flex).
- `visao/pedido/modelo01/PedidoTabActivity2.java` – variante mais antiga, com mesma estrutura conceitual.
- `Login.java` / `Menu.java` – hidratação dos parâmetros a partir de `empresa` e `representante`.
