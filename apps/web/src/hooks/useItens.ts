import type { ConsultaItens, FiltrosItens } from "@planogestao/api-client";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import { api } from "../services/api";

/**
 * Filtros da listagem de itens (ações e sub-itens), espelhados na URL: os cards do Dashboard abrem
 * a listagem já filtrada (recorte do card + período).
 */
export const CAMPOS_LISTA = ["status", "prazo"] as const;
export const CAMPOS_TEXTO = [
  "plano_id", "responsavel_id", "area_id", "setor_id", "nivel", "periodo", "data_inicio", "data_fim", "campo_data", "arquivados",
] as const;

export type FiltrosItensUrl = FiltrosItens;

export function lerFiltrosItens(params: URLSearchParams): FiltrosItens {
  const f: Record<string, unknown> = {};
  for (const c of CAMPOS_LISTA) {
    const v = params.getAll(c);
    if (v.length) f[c] = v;
  }
  for (const c of CAMPOS_TEXTO) {
    const v = params.get(c);
    if (v) f[c] = c.endsWith("_id") ? Number(v) : v;
  }
  // Personalizado incompleto não filtra (o backend exigiria as duas datas).
  if (f.periodo === "personalizado" && !(f.data_inicio && f.data_fim)) {
    delete f.periodo;
  }
  return f as FiltrosItens;
}

export function paraQuery(f: Partial<Record<string, unknown>>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) v.forEach((x) => p.append(k, String(x)));
    else p.set(k, String(v));
  }
  return p.toString();
}

export function useFiltrosItens() {
  const [params, setParams] = useSearchParams();
  const filtros = useMemo(() => lerFiltrosItens(params), [params]);
  const pagina = Math.max(1, Number(params.get("page")) || 1);
  const tamanho = [10, 20, 50, 100].includes(Number(params.get("page_size"))) ? Number(params.get("page_size")) : 20;

  const atualizar = useCallback(
    (parcial: Record<string, unknown>) =>
      setParams((atual) => {
        const p = new URLSearchParams(atual);
        for (const [k, v] of Object.entries(parcial)) {
          p.delete(k);
          if (Array.isArray(v)) v.forEach((x) => p.append(k, String(x)));
          else if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
        }
        if (!("page" in parcial)) p.delete("page");
        return p;
      }),
    [setParams],
  );
  const limpar = useCallback(() => setParams(new URLSearchParams()), [setParams]);

  return { filtros, pagina, tamanho, atualizar, limpar };
}

export const useListaItens = (c: ConsultaItens) =>
  useQuery({ queryKey: ["itens", "lista", c], queryFn: () => api.itens.listar(c), placeholderData: keepPreviousData });
