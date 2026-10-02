import type { FiltroPeriodo } from "@planogestao/api-client";
import type { TipoPeriodo } from "@planogestao/shared-types";
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import { ROTULO_PERIODO } from "../utils/rotulos";

export const PERIODO_PADRAO: TipoPeriodo = "mes_atual";
const ISO_DATA = /^\d{4}-\d{2}-\d{2}$/;

function ehTipoPeriodo(valor: string | null): valor is TipoPeriodo {
  return valor !== null && valor in ROTULO_PERIODO;
}

/**
 * Período selecionado, guardado na URL (?periodo=&data_inicio=&data_fim=): sobrevive ao
 * recarregar, pode ser compartilhado e é repassado aos links de drill-down.
 */
export function useFiltroPeriodo() {
  const [params, setParams] = useSearchParams();

  const bruto = params.get("periodo");
  const tipo = ehTipoPeriodo(bruto) ? bruto : PERIODO_PADRAO;
  const dataInicio = params.get("data_inicio") ?? "";
  const dataFim = params.get("data_fim") ?? "";

  // Personalizado só vale com as duas datas válidas e em ordem; até lá, a página usa o padrão.
  const personalizadoCompleto =
    ISO_DATA.test(dataInicio) && ISO_DATA.test(dataFim) && dataInicio <= dataFim;

  const filtro = useMemo<FiltroPeriodo>(() => {
    if (tipo !== "personalizado") return { periodo: tipo };
    if (personalizadoCompleto) return { periodo: tipo, data_inicio: dataInicio, data_fim: dataFim };
    return { periodo: PERIODO_PADRAO };
  }, [tipo, dataInicio, dataFim, personalizadoCompleto]);

  const alterar = useCallback(
    (novo: { periodo: TipoPeriodo; data_inicio?: string; data_fim?: string }) => {
      setParams(
        (atual) => {
          const proximo = new URLSearchParams(atual);
          proximo.set("periodo", novo.periodo);
          for (const chave of ["data_inicio", "data_fim"] as const) {
            const valor = novo.periodo === "personalizado" ? novo[chave] : undefined;
            if (valor) proximo.set(chave, valor);
            else proximo.delete(chave);
          }
          return proximo;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  return { tipo, dataInicio, dataFim, filtro, alterar, personalizadoIncompleto: tipo === "personalizado" && !personalizadoCompleto };
}

/** Query string do filtro, para anexar aos links (ex.: /planos?status=atrasado&periodo=30d). */
export function filtroComoQuery(filtro: FiltroPeriodo): string {
  const p = new URLSearchParams({ periodo: filtro.periodo });
  if (filtro.data_inicio) p.set("data_inicio", filtro.data_inicio);
  if (filtro.data_fim) p.set("data_fim", filtro.data_fim);
  return p.toString();
}
