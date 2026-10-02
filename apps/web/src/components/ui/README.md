# `components/ui` — Mallory Design System

Implementação do UI Kit Mallory ("Gestor de Contratos", adaptado ao PlanoGestão). As telas só usam estes
componentes e os tokens; trocar o visual é mexer aqui e em `src/styles/tokens.css`.

- **Tokens** (`src/styles/tokens.css`): camada 1 = tokens do kit com os nomes do kit (`--bg`, `--primary`,
  `--r-md`, `--space-4`, `--shadow-sm`, `--c1..c6`…), em `data-theme="light|dark"` e `data-density="compact|comfortable|spacious"`;
  camada 2 = apelidos do app (`--cor-*`, `--espaco-*`, `--raio-*`, `--fonte-*`) que só apontam para a camada 1.
- **Fontes** (`src/styles/fonts.css`, `src/assets/fonts`): Sora (títulos/KPI), Inter (corpo), IBM Plex Mono (números/códigos), locais.
- **Tema e densidade**: `store/aparenciaStore.ts` + `layout/ControlesAparencia` (barra superior e login); preferência do navegador.
  Impressão sempre em tema claro.
- **Métricas de componente** (paddings de 9/10/14px, raio 10px do botão-ícone etc.) seguem o kit e ficam só nos
  CSS desta pasta; fora dela, só tokens.
- **Vitrine**: `/dev/ui-kit` (somente `pnpm dev`, fora do login) mostra todos os componentes nos dois temas.

## Primitivos

| Componente | API principal | Usado em |
|---|---|---|
| `Button` / `ButtonLink` / `classesDoBotao` | `variante` primaria (primary) · secundaria (ghost) · perigo (danger-soft) · link · icone · `tamanho` md/sm (pílula) · `bloco` | ~35 arquivos: todas as telas com ações |
| `Input`, `Textarea`, `Checkbox` | props nativas · `compacto` · Checkbox `rotulo` | ~19 arquivos: formulários, filtros, login |
| `Select` | props de `<select>` · `compacto` | ~14 arquivos |
| `Field` + `fieldAria` | `id rotulo obrigatorio erro aviso ajuda` (rótulo em maiúsculas; erro pinta o rótulo) | wizard e edição de plano, ação, admin |
| `Badge`, `BadgeGroup` | `tom` neutro · primaria · sucesso · aviso · erro · info · `corToken` (fundo 13% + ponto) · `ponto` · `tamanho` sm | admin, colunas de planos, Minhas Ações, detalhe da ação + StatusBadges |
| `Card` | `titulo nivel idTitulo como acoes carregando erro vazio mensagemVazio atualizando semPadding` + `aria-*` | ~20 arquivos: dashboard, indicadores, relatórios, gamificação, detalhe do plano, admin, login |
| `KpiCard` | `valor rotulo sufixo dica tom variacao serie` (sparkline) | Indicadores, Gamificação (o cartão clicável do Dashboard segue o mesmo visual em CSS local) |
| `Table` | `legenda semRolagem` · células com `data-numerico`, `data-acoes`, `tr data-inativo` | planos, ações do plano, evolução, relatórios, Minhas Ações, ranking, admin |
| `Avatar` | `nome url tamanho` sm/md/lg/xl (quadrado arredondado, cor estável por nome) | UserCard, Gamificação |
| `ProgressBar` | `valor rotulo corToken` (percentual em pt-BR) | detalhe da ação, painel do dia, planos recentes, colunas e ações do plano, Minhas Ações |
| `Icon` (+ `IconName`, `NOMES_ICONES`) | `name size strokeWidth color titulo` — 46 ícones do kit + complementares no mesmo traço | menu, sino/notificações, calendário, Minhas Ações, wizard, drawer, tabela de planos, gamificação, login |
| `Modal` | `aberto titulo onFechar acoes` | confirmações e formulários de admin e planos |
| `Tabs` (+ `TabItem`) | `abas ativa onSelecionar rotulo` (pílula do kit) | detalhe do plano, relatórios |

## Compostos e de domínio

| Componente | Usado em |
|---|---|
| `Drawer` | filtros de planos, painel do dia, ação no Kanban, Minhas Ações |
| `DropdownMenu`, `DropdownItem` | exportar, ações do plano, seletor de colunas |
| `Pagination` | Planos, Minhas Ações, Notificações, Gamificação, Relatórios, Usuários |
| `UserPicker` | wizard (identificação e ações) |
| `FileDropzone` | anexos (wizard e detalhe) |
| `Wizard` | novo plano |
| `PriorityBadge`, `ActionStatusBadge`, `PlanStatusBadge`, `DeadlineStatusLabel` (StatusBadges) | status e situação de prazo em todas as listagens, calendário, relatórios |

## Deixados nativos (estrutura, com estilo local em tokens)

Dias/células do calendário · segmentados com `aria-pressed` (Mês/Semana/Lista, Tabela/Kanban, agrupamento dos
Indicadores, atalhos de planos, cartões-filtro de Minhas Ações e do plano, densidade) · linha clicável de Minhas Ações ·
cabeçalho ordenável da tabela de planos · sino e itens do painel de notificações · lista lateral de perfis · passos do
Wizard · itens do DropdownMenu · `<input type="range">` e `<input type="file">` · pódio da gamificação · cartões do kanban.

## Desvios conscientes do kit

- Texto de badges/deltas em cor de tom misturada com 25% de `--fg` (amarelo e verde puros ficam com contraste baixo).
- Status "bloqueada" usa `--c1` (laranja de gráfico) para não confundir com "atrasada" (`--danger`).
