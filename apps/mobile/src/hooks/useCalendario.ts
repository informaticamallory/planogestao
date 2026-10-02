import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { api } from "../services/api";

export interface Mes {
  ano: number;
  mes: number; // 1-12
}

export const somarMeses = ({ ano, mes }: Mes, n: number): Mes => {
  const i = ano * 12 + (mes - 1) + n;
  return { ano: Math.floor(i / 12), mes: (i % 12) + 1 };
};

// Mesmas chaves-base do web (["calendario", ...]); alterar uma ação invalida tudo que começa por "calendario".
const chaveMes = (m: Mes) => ["calendario", "mes", m.ano, m.mes] as const;

const buscarMes = (m: Mes) => api.calendario.mensal(m.ano, m.mes, {});

/** Resumo do mês (GET /calendario). Mantém o mês anterior na tela enquanto o novo chega e pré-carrega os vizinhos. */
export function useCalendarioMensal(m: Mes) {
  const queryClient = useQueryClient();
  const consulta = useQuery({ queryKey: chaveMes(m), queryFn: () => buscarMes(m), placeholderData: keepPreviousData });

  useEffect(() => {
    for (const vizinho of [somarMeses(m, -1), somarMeses(m, 1)]) {
      void queryClient.prefetchQuery({ queryKey: chaveMes(vizinho), queryFn: () => buscarMes(vizinho), staleTime: 60_000 });
    }
  }, [m.ano, m.mes, queryClient]);

  return consulta;
}

/** Ações de um dia (GET /calendario/dia), buscadas só quando o dia é aberto. */
export const useAcoesDoDia = (data: string | null) =>
  useQuery({
    queryKey: ["calendario", "dia", data],
    queryFn: () => api.calendario.dia(data!, {}),
    enabled: data !== null,
  });
