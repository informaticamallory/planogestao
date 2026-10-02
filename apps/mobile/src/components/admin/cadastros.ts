/** Configuração dos cadastros simples (nome + ativo) — mesmos textos e chamadas do web (CadastrosPages.tsx). */
import type { AreaItem, SetorItem, TipoPlanoItem } from "@planogestao/shared-types";

import { useAreasAdmin, useSetoresAdmin, useTiposPlanoAdmin } from "../../hooks/useAdmin";
import { api } from "../../services/api";

export type TipoCadastro = "areas" | "setores" | "tipos";
export type ItemCadastro = AreaItem | SetorItem | TipoPlanoItem;

export const CADASTROS: Record<
  TipoCadastro,
  {
    titulo: string;
    rotulo: string;
    feminino: boolean;
    descricao: string;
    detalhe: (i: ItemCadastro) => string;
    salvar: (id: number | null, corpo: { nome: string; ativo: boolean; area_id?: number }) => Promise<unknown>;
    excluir: (id: number) => Promise<unknown>;
  }
> = {
  areas: {
    titulo: "Áreas",
    rotulo: "área",
    feminino: true,
    descricao: "Áreas da fábrica. Definem a visibilidade dos planos e agrupam setores e usuários.",
    detalhe: (i) => {
      const a = i as AreaItem;
      return `${a.setores} setor(es) · ${a.usuarios} usuário(s) · ${a.planos} plano(s)`;
    },
    salvar: (id, c) => (id ? api.admin.areas.atualizar(id, { nome: c.nome, ativo: c.ativo }) : api.admin.areas.criar({ nome: c.nome, ativo: c.ativo })),
    excluir: api.admin.areas.excluir,
  },
  setores: {
    titulo: "Setores",
    rotulo: "setor",
    feminino: false,
    descricao: "Setores de cada área (onde o colaborador trabalha). Equipes de trabalho são cadastradas no módulo Equipes.",
    detalhe: (i) => {
      const s = i as SetorItem;
      return `${s.area} · ${s.usuarios} usuário(s) · ${s.planos} plano(s)`;
    },
    salvar: (id, c) => {
      const corpo = { nome: c.nome, ativo: c.ativo, area_id: c.area_id! };
      return id ? api.admin.setores.atualizar(id, corpo) : api.admin.setores.criar(corpo);
    },
    excluir: api.admin.setores.excluir,
  },
  tipos: {
    titulo: "Tipos de Plano",
    rotulo: "tipo de plano",
    feminino: false,
    descricao: "Classificação usada no cadastro e nos filtros de planos de ação.",
    detalhe: (i) => `${(i as TipoPlanoItem).planos} plano(s)`,
    salvar: (id, c) => (id ? api.admin.tiposPlano.atualizar(id, { nome: c.nome, ativo: c.ativo }) : api.admin.tiposPlano.criar({ nome: c.nome, ativo: c.ativo })),
    excluir: api.admin.tiposPlano.excluir,
  },
};

export const ehTipoCadastro = (t: unknown): t is TipoCadastro => t === "areas" || t === "setores" || t === "tipos";

/** Chama os três hooks sempre (regra dos hooks) e devolve a consulta do tipo pedido. */
export function useCadastro(tipo: TipoCadastro) {
  const areas = useAreasAdmin();
  const setores = useSetoresAdmin();
  const tipos = useTiposPlanoAdmin();
  return { consulta: tipo === "areas" ? areas : tipo === "setores" ? setores : tipos, areas };
}
