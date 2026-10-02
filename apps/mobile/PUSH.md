# Push notifications — configuração

O código (backend e app) está pronto. Para o push **chegar** no aparelho faltam três coisas que
dependem de contas da empresa. Sem elas o app funciona normalmente e só pula o registro do token
(no console do Metro aparece `[push] indisponivel <motivo>`).

## 1. Projeto EAS (gera o `projectId`)

```bash
npx eas-cli@latest login
npx eas-cli@latest init
```

Como a configuração é dinâmica (`app.config.ts`), o `init` mostra o `projectId` e o `owner` em vez de
gravá-los: cole nas constantes `EAS_PROJECT_ID` / `EAS_OWNER` do `app.config.ts`. Sem o `projectId`
não existe token do Expo.

## 2. Firebase Cloud Messaging (Android)

1. No console do Firebase, crie um projeto e adicione um app Android **para cada variante** que vai
   receber push: `br.com.mallory.planogestao` (produção), `br.com.mallory.planogestao.homolog`
   (preview) e, se quiser, `br.com.mallory.planogestao.dev`. Um único `google-services.json` contém
   todos.
2. Baixe o `google-services.json` e salve em `apps/mobile/google-services.json`. O `app.config.ts`
   passa a usá-lo automaticamente (só referencia o arquivo se ele existir).
3. Em *Configurações do projeto → Contas de serviço*, gere a chave privada (JSON) da conta de
   serviço e envie ao Expo: `npx eas-cli@latest credentials` → Android → *Google Service Account*
   → *FCM V1*. **Essa chave é uma credencial: não versionar.**

iOS exige conta Apple Developer (APNs); o `eas credentials` configura quando houver.

## 3. Development build (o Expo Go no Android não recebe push desde o SDK 53)

Local, com o emulador aberto (precisa de imagem com Google Play — o `Pixel_9_Pro` tem):

```bash
npx expo run:android
```

Ou na nuvem: `npx eas-cli@latest build --profile development --platform android`.

## Como funciona

- **Registro:** ao entrar na área logada o app pede a permissão (só uma vez; se negar, não
  insiste), obtém o token e chama `POST /dispositivos/registrar-token`. No logout chama
  `POST /dispositivos/remover-token`.
- **Envio:** todo evento que grava uma notificação (`services/notificacao_service.py`) agenda um
  push; ele sai **após o commit**, numa thread de fundo, para os tokens ativos do usuário
  (`services/push.py`). Rollback descarta o push. `DeviceNotRegistered` desativa o token.
  `PUSH_HABILITADO=false` no `.env` desliga o envio.
- **Toque:** o push leva `data.url` (`/acoes/{id}` ou `/planos/{id}`); o app abre essa tela e
  marca a notificação como lida — com o app aberto, em segundo plano ou fechado.

## Teste de aceite

1. Faça login no development build com o usuário que vai receber (ex.: Carlos) e aceite a permissão.
2. Feche o app (arraste para fora dos recentes).
3. Na web, com um gestor, adicione a um plano em andamento uma ação com o Carlos como responsável.
4. O push chega; tocar nele abre o app no detalhe da ação.
