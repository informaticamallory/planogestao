# PlanoGestão — app mobile (Expo SDK 57)

App React Native (Expo Router) do PlanoGestão. Consome a mesma API do web através de
`@planogestao/api-client`.

## Ambientes e variantes

| Perfil EAS    | `APP_VARIANT` | Nome no aparelho        | Android `applicationId` / iOS `bundleIdentifier` | Saída Android | API                      |
|---------------|---------------|-------------------------|--------------------------------------------------|---------------|--------------------------|
| `development` | development   | PlanoGestão (Dev)       | `br.com.mallory.planogestao.dev`                 | .apk (dev client) | local / variável do ambiente `development` |
| `preview`     | preview       | PlanoGestão (Homolog)   | `br.com.mallory.planogestao.homolog`             | **.apk** instalável | **homologação** (ambiente `preview`) |
| `production`  | production    | PlanoGestão             | `br.com.mallory.planogestao`                     | **.aab** (Play Store) | produção (ambiente `production`, HTTPS obrigatório) |

Cada variante tem id próprio: as três instalam lado a lado no mesmo aparelho.

Toda a configuração fica em [`app.config.ts`](app.config.ts) (não existe `app.json`) e os perfis em
[`eas.json`](eas.json). Nada de URL fixa no código: a API vem de `EXPO_PUBLIC_API_URL`.

**Travas do `app.config.ts`** (o build falha logo no início, em vez de gerar um app quebrado):
- `preview`/`production` sem `EXPO_PUBLIC_API_URL` → erro;
- `production` com URL `http://` → erro (lojas e sistemas exigem HTTPS);
- URL `http://` em `preview` (ex.: homologação na rede interna) → libera tráfego HTTP no Android
  (`usesCleartextTraffic`), que o Android bloqueia por padrão em builds de release. Com HTTPS, o
  bloqueio padrão é mantido. **No iOS, homologação precisa ser HTTPS.**

O login e a tela **Mais** mostram no rodapé `v1.0.0 · Homologação · <servidor>` — é o jeito rápido de
conferir, num aparelho, para qual API o build instalado aponta.

## Versionamento

- **Versão visível nas lojas** (`1.0.0`): campo `version` do [`package.json`](package.json). Suba-a a
  cada release (semver).
- **Número de build** (Android `versionCode` / iOS `buildNumber`): controlado pelo EAS
  (`"appVersionSource": "remote"`) e **incrementado automaticamente** a cada build `production`
  (`"autoIncrement": true`). Consultar/ajustar: `eas build:version:get` / `eas build:version:set`.

## Ícone e splash

Placeholders da marca (monograma "PG" laranja `#ff6600`, splash escuro com "PlanoGestão") em
`assets/`. Para trocar pela identidade definitiva, substitua os arquivos mantendo nomes e tamanhos:
`icon.png` (1024², opaco), `android-icon-foreground.png` / `android-icon-monochrome.png` (1024²,
transparente, conteúdo nos 66% centrais), `android-icon-background.png`, `splash-icon.png` (1024²,
transparente) e `notification-icon.png` (96², branco sobre transparente).

---

## Pré-requisitos (uma vez)

1. **Conta Expo** da empresa e EAS CLI: `npm install -g eas-cli` (ou use `npx eas-cli@latest` no
   lugar de `eas` em todos os comandos abaixo). Depois `eas login`.
2. **Git no repositório.** O EAS envia o projeto a partir da raiz do repositório git — e este app
   depende de `packages/api-client` e `packages/shared-types`, que ficam fora de `apps/mobile`. Se o
   monorepo ainda não é um repositório git, na raiz: `git init`, `git add -A`, `git commit -m "..."`.
   O EAS envia só o que o git versiona (respeitando o `.gitignore`).
3. **Vincular o projeto**, de dentro de `apps/mobile`:
   ```bash
   eas init
   ```
   Como a configuração é dinâmica (`app.config.ts`), o `eas init` não consegue gravá-la: ele mostra o
   `projectId` (e o `owner`). Cole os dois nas constantes `EAS_PROJECT_ID` / `EAS_OWNER` do
   `app.config.ts`. O `projectId` também é necessário para o push (ver [PUSH.md](PUSH.md)).
4. **URL da API por ambiente** — veja a seção 3 abaixo. Sem ela, `preview` e `production` não geram.

> Todos os comandos `eas` rodam **de dentro de `apps/mobile`**.

## 1) APK de teste (homologação) — perfil `preview`

```bash
eas build --platform android --profile preview
```

(ou `pnpm --filter @planogestao/mobile build:apk` da raiz).

- Na primeira vez, o EAS pergunta se pode gerar a chave de assinatura Android (keystore): responda
  **sim** — ela fica guardada no EAS e é reutilizada em todos os builds.
- Ao terminar, o terminal mostra um link e um QR code. Abra no **Android físico**, baixe o `.apk` e
  instale (o Android pede para permitir "instalar apps desconhecidos" do navegador na primeira vez).
- O app abre com o nome **PlanoGestão (Homolog)** e o rodapé do login mostra o servidor de
  homologação. Ele roda sozinho, sem Metro nem computador por perto.

## 2) Builds de produção para as lojas — perfil `production`

```bash
eas build --platform android --profile production   # .aab para a Play Store
eas build --platform ios --profile production       # .ipa para TestFlight / App Store
eas build --platform all --profile production       # os dois
```

- **Android:** gera `.aab`. Envio: `eas submit --platform android --latest` (exige uma conta de
  serviço do Google Play configurada — o EAS guia na primeira vez) ou upload manual no Play Console.
  O primeiro envio de um app novo na Play Store precisa ser manual pelo console.
- **iOS:** exige conta **Apple Developer**. No primeiro build o EAS pede login Apple e cria
  certificados/perfis. Envio para o TestFlight: `eas submit --platform ios --latest`.
- O número de build sobe sozinho; lembre-se de subir `version` no `package.json` a cada release.

## 3) URL da API por ambiente (desenvolvimento / homologação / produção)

A URL é a variável `EXPO_PUBLIC_API_URL`, lida pelo `app.config.ts` e embutida no app no build.
Cada perfil do `eas.json` usa um **ambiente do EAS** (`"environment"`), e a variável é cadastrada
por ambiente — fora do repositório:

```bash
# homologação (perfil preview)
eas env:set --environment preview --name EXPO_PUBLIC_API_URL --value https://api-homolog.suaempresa.com.br --visibility plaintext

# produção
eas env:set --environment production --name EXPO_PUBLIC_API_URL --value https://api.suaempresa.com.br --visibility plaintext

# conferir
eas env:list --environment preview
```

O mesmo `eas env:set` **atualiza** um valor existente. Um build já instalado não muda: depois de
trocar a URL, gere um novo build.

> Use `plaintext` (ou `sensitive`): variáveis do tipo `secret` não ficam disponíveis na leitura do
> `app.config.ts`. A URL da API não é segredo — ela vai dentro do app de qualquer forma.

**Desenvolvimento local** (Metro + Expo Go ou dev client): sem a variável, o app descobre sozinho o
backend local (emulador Android → `10.0.2.2:8000`; aparelho físico → IP do computador que roda o
Metro). Para apontar para outro servidor, crie `apps/mobile/.env.local` (não versionado):

```bash
EXPO_PUBLIC_API_URL=https://api-homolog.suaempresa.com.br
```

ou baixe as variáveis de um ambiente do EAS: `eas env:pull --environment preview`. Reinicie o Metro
depois de mudar (`npx expo start --clear`).

## Rodando em desenvolvimento

```bash
pnpm install                 # na raiz do monorepo
cd apps/mobile
npx expo start --go          # Expo Go (sem push remoto no Android — ver PUSH.md)
npx expo start               # dev client (build do perfil development ou `npx expo run:android`)
```

Backend acessível na rede para aparelho físico: `uvicorn app.main:app --host 0.0.0.0 --port 8000`.

## Checagens

```bash
npx tsc --noEmit             # tipos
npx expo-doctor              # dependências e configuração do Expo
npx expo config --type public   # configuração resolvida (use APP_VARIANT/EXPO_PUBLIC_API_URL para simular um perfil)
```
