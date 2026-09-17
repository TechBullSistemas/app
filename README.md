# TechBull Vendas (App Mobile)

Aplicativo React Native (Expo) para representantes comerciais com operação **offline**.

## Pré-requisitos

- Node.js 20+
- Expo CLI (já vem com o template via `npx`)
- Para testar no celular: app **Expo Go** ou um build via EAS

## Instalação

```bash
cd c:\Users\User\Documents\TechBull\app
npm install
```

Crie o arquivo `.env` com a URL da API (frontend Next.js do TechBull):

```bash
cp .env.example .env
# edite .env e ajuste EXPO_PUBLIC_API_URL para o IP/porta da máquina onde roda o frontend
# ex.: EXPO_PUBLIC_API_URL=http://192.168.0.10:3000
```

## Rodando

```bash
npm run start
# escaneie o QR code com o app Expo Go
```

## Build

```bash
npx eas build --platform android
```

## Estrutura

```
app/             # rotas (expo-router)
  (auth)/login   # tela de login
  (app)/         # área autenticada
src/
  api/           # cliente axios com bearer token
  db/            # SQLite local + repositórios + migrations
  sync/          # download / upload com progresso
  services/      # photoCache, pdfVenda, location
  stores/        # zustand (sessão, sync progress, online status)
  components/    # componentes compartilhados
```

## Fluxo

1. **Login** com email/senha → recebe token do `/api/mobile/auth/login`.
2. **Buscar Informações** (`/sync/buscar`): apaga o banco local e baixa tudo do `/api/mobile/sync/*`.
3. Trabalha **offline**: consultas, novas vendas e visitas são gravadas no SQLite + outbox.
4. **Enviar Informações** (`/sync/enviar`): sobe vendas e visitas para `/api/mobile/upload/*` quando há internet.
5. PDF da venda gerado localmente (`expo-print`); o botão **Enviar por E-mail** só aparece online (`/api/mobile/email/venda`).

## Produtos liberados para internet

O catálogo continua recebendo apenas produtos ativos. Se a configuração da empresa `idVerificaTambemColunaLiberadoInternet` estiver ativa, exige também `idLiberadoInternet`. A API aplica o filtro e o app o confere antes da gravação local. A flag vem do DUAPI; a configuração começa desativada e produtos legados começam liberados.

Após mudar a configuração ou a liberação no DUAPI, aguarde a integração e execute **Buscar informações** para renovar o catálogo. A migração SQLite é automática e compatível com OTA; não apaga vendas pendentes. A API antiga, sem as novas propriedades, mantém o comportamento anterior.

## Clientes ativos e preço na venda

**Buscar informações** recebe a situação `idAtivo` de todos os clientes, incluindo inativos para consulta de histórico. Novos cadastros permanecem ativos por padrão. Com Duapi, a situação é alterada em `cliente.ativo` (`S`/`N`) e chega após a integração.

Novos pedidos só permitem selecionar clientes ativos e produtos com `vl_venda > 0`, inclusive no filtro **Somente vendidos**. Antes de salvar ou editar pedidos pendentes, o app reconsulta os cadastros locais. A API também recusa a entrada de novas vendas para clientes inativos; reenvios de pedidos já recebidos são idempotentes.

A atualização usa `cliente.id_ativo`, já existente no SQLite, e pode ser distribuída por OTA após a publicação da API. Sem conexão, a validação usa a última base baixada; o envio verifica novamente a situação no servidor.

## Condição de preço preferencial e fotos por saldo

Após **Buscar informações**, novos itens usam a condição de preço do cliente.
A API resolve `cdTabelaPrecoCondicao` (vínculo na tabela) para
`cdCondicaoPrecoPadrao` (condição usada no cálculo); o app grava os dois campos
por migração SQLite aditiva, compatível com OTA. Sem preferência disponível,
mantém a primeira condição padrão. Trocar o cliente reaplica a preferência aos
itens; reabrir um pedido salvo preserva as condições existentes. O vendedor
continua podendo escolher outra condição por item.

A holding pode ter `id_busca_fotos_apenas_produtos_com_saldo` habilitado
na engrenagem da tela **Integração DUAPI** ou no banco da API (padrão `false`). Nesse caso, a API omite a URL das
fotos de produtos sem saldo positivo na empresa selecionada, mantendo o produto
no catálogo. A próxima sincronização atualiza as fotos e reaproveita o cache
quando o mesmo produto volta a ter saldo.

Publicar primeiro a migração e a API; somente após o deploy concluído publicar
a OTA no canal `production`. No tablet, executar **Buscar informações**.

## Clientes com títulos vencidos

A opção `idBloqueiaVendaClienteAtrasadoApp` da holding começa desativada e é
editável pela engrenagem da integração. A API sincroniza a regra e a data do
primeiro título aberto por cliente, incluindo vencimentos futuros. Após o dia
do vencimento em Brasília, o app bloqueia seleção e gravação de venda, inclusive
offline. Considera todas as empresas da holding; títulos quitados, cancelados
ou negociados não entram no cálculo.

Ao receber uma venda nova, a API valida novamente. Reenvios de pedidos já
recebidos permanecem idempotentes. Após pagamento ou mudança da configuração,
aguarde a integração DUAPI e use **Buscar informações** para atualizar a base
local. A migração SQLite é aditiva e não remove pedidos pendentes.
