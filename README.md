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
