/**
 * Estrutura única do menu e das rotas: o Sidebar e o AppRoutes leem daqui.
 * A permissão é só para esconder o item; quem garante o acesso é o backend.
 */
import type { IconName } from "../components/ui/Icon";

export interface ItemMenu {
  titulo: string;
  caminho: string;
  permissao: string;
  /** Ícone do kit no menu lateral. */
  icone?: IconName;
}

export interface GrupoMenu {
  titulo: string;
  itens: ItemMenu[];
}

export const MENU_PRINCIPAL: ItemMenu[] = [
  { titulo: "Dashboard", caminho: "/dashboard", permissao: "dashboard:ver", icone: "home" },
  { titulo: "Planos de Ação", caminho: "/planos", permissao: "planos:ver", icone: "listChecks" },
  { titulo: "Minhas Ações", caminho: "/minhas-acoes", permissao: "acoes:ver_proprias", icone: "userCheck" },
  { titulo: "Equipes", caminho: "/equipes", permissao: "equipes:ver", icone: "users" },
  { titulo: "Calendário", caminho: "/calendario", permissao: "calendario:ver", icone: "calendar" },
  { titulo: "Indicadores", caminho: "/indicadores", permissao: "indicadores:ver", icone: "barChart" },
  { titulo: "Relatórios", caminho: "/relatorios", permissao: "relatorios:ver", icone: "fileText" },
  { titulo: "Notificações", caminho: "/notificacoes", permissao: "notificacoes:ver", icone: "bell" },
  { titulo: "Gamificação & Eficiência", caminho: "/gamificacao", permissao: "gamificacao:ver", icone: "trophy" },
];

export const MENU_ADMINISTRACAO: GrupoMenu = {
  titulo: "Administração",
  itens: [
    { titulo: "Usuários", caminho: "/admin/usuarios", permissao: "admin:usuarios", icone: "users" },
    { titulo: "Perfis", caminho: "/admin/perfis", permissao: "admin:perfis", icone: "shield" },
    // Cadastros: permissão atribuível (Administrador e Gestor por padrão), não exclusiva do Administrador.
    { titulo: "Áreas", caminho: "/admin/areas", permissao: "cadastros:gerenciar", icone: "building" },
    { titulo: "Setores", caminho: "/admin/setores", permissao: "cadastros:gerenciar", icone: "layout" },
    { titulo: "Tipos de Plano", caminho: "/admin/tipos-plano", permissao: "cadastros:gerenciar", icone: "folder" },
    { titulo: "Origens", caminho: "/admin/origens", permissao: "cadastros:gerenciar", icone: "flag" },
    { titulo: "Configurações", caminho: "/admin/configuracoes", permissao: "admin:configuracoes", icone: "settings" },
    { titulo: "Configurações de e-mail", caminho: "/admin/email", permissao: "admin:configuracoes", icone: "mail" },
  ],
};

/** Rotas que existem mas não aparecem no menu (destinos de drill-down). */
export const ROTAS_SEM_MENU: ItemMenu[] = [
  // Listagem de itens (ações e sub-itens): destino dos cards do Dashboard.
  { titulo: "Ações e sub-itens", caminho: "/acoes", permissao: "planos:ver" },
  // Fora do menu (redundante): o acesso é pelo botão "Novo Plano" da listagem de Planos.
  { titulo: "Novo Plano", caminho: "/planos/novo", permissao: "planos:criar" },
  { titulo: "Detalhe do Plano", caminho: "/planos/:id", permissao: "planos:ver" },
  // A permissão fina (editar ou ser o autor) é decidida pelo backend e exposta em `permissoes`.
  { titulo: "Editar Plano", caminho: "/planos/:id/editar", permissao: "planos:ver" },
  { titulo: "Detalhe da Ação", caminho: "/acoes/:id", permissao: "planos:ver" },
  { titulo: "Nova Equipe", caminho: "/equipes/nova", permissao: "equipes:gerenciar" },
  { titulo: "Detalhe da Equipe", caminho: "/equipes/:id", permissao: "equipes:ver" },
  { titulo: "Editar Equipe", caminho: "/equipes/:id/editar", permissao: "equipes:gerenciar" },
  // Gamificação: as ações de cada tela dependem das permissões de apuração (a API confere cada uma).
  { titulo: "Períodos e prêmios", caminho: "/gamificacao/periodos", permissao: "gamificacao:ver" },
  { titulo: "Auditoria da pontuação", caminho: "/gamificacao/auditoria", permissao: "gamificacao:auditoria" },
];

export const TODOS_ITENS: ItemMenu[] = [...MENU_PRINCIPAL, ...MENU_ADMINISTRACAO.itens, ...ROTAS_SEM_MENU];
