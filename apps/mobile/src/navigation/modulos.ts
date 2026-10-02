import type { NomeIcone } from "../components/Icone";

/**
 * Módulos do menu "Mais" (uso menos frequente no celular). Mesmas permissões do menu web
 * (apps/web/src/routes/menu.ts): a permissão só esconde o item; quem garante o acesso é a API.
 */
export interface ModuloMais {
  id: string;
  titulo: string;
  descricao: string;
  icone: NomeIcone;
  permissao: string;
}

export const MODULOS_MAIS: ModuloMais[] = [
  { id: "planos", titulo: "Planos de Ação", descricao: "Listagem, detalhe e acompanhamento dos planos.", icone: "listChecks", permissao: "planos:ver" },
  { id: "equipes", titulo: "Equipes", descricao: "Colaboradores por área e setor.", icone: "users", permissao: "equipes:ver" },
  { id: "gamificacao", titulo: "Gamificação & Eficiência", descricao: "Pódio, pontuação e ranking do período.", icone: "trophy", permissao: "gamificacao:ver" },
  { id: "indicadores", titulo: "Indicadores", descricao: "Gráficos de planos e ações por período.", icone: "barChart", permissao: "indicadores:ver" },
  { id: "relatorios", titulo: "Relatórios", descricao: "Relatórios de planos e ações com exportação.", icone: "fileText", permissao: "relatorios:ver" },
  // Fase 13: o módulo Administração é exclusivo do perfil Administrador (a API responde 403 aos demais).
  // As permissões admin:* só existem nesse perfil, por isso basta uma delas para decidir a visibilidade.
  { id: "administracao", titulo: "Administração", descricao: "Usuários, perfis, cadastros e configurações.", icone: "shield", permissao: "admin:usuarios" },
];
