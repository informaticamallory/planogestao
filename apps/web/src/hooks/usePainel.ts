import type { DadoCatalogo, LayoutTela, Tela, Visualizacao, WidgetLayout } from "@planogestao/shared-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { novoId, ocupadosVisiveis, posicaoLivre } from "../components/painel/layoutGrid";
import { api } from "../services/api";

const chave = (tela: Tela) => ["preferencias", tela] as const;

/**
 * Estado do painel de widgets de uma tela, por usuário (salvo no backend).
 * Fora da edição mostra o layout salvo; "Personalizar" abre um rascunho que só vai para a API em
 * "Salvar layout" — "Sair sem salvar" o descarta, "Restaurar padrão" apaga a personalização.
 */
export function usePainel(tela: Tela) {
  const qc = useQueryClient();
  const consulta = useQuery({ queryKey: chave(tela), queryFn: () => api.preferencias.obter(tela), staleTime: Infinity });
  const [rascunho, setRascunho] = useState<WidgetLayout[] | null>(null);
  const aoSalvo = (layout: LayoutTela) => {
    qc.setQueryData(chave(tela), layout);
    setRascunho(null);
  };
  const salvar = useMutation({ mutationFn: (widgets: WidgetLayout[]) => api.preferencias.salvar(tela, widgets), onSuccess: aoSalvo });
  const restaurar = useMutation({ mutationFn: () => api.preferencias.restaurar(tela), onSuccess: aoSalvo });

  const salvos = consulta.data?.widgets;
  const widgets = rascunho ?? salvos ?? [];
  const catalogo = useMemo(() => new Map((consulta.data?.catalogo ?? []).map((d) => [d.tipo_dado, d])), [consulta.data?.catalogo]);
  const alterado = rascunho !== null && JSON.stringify(rascunho) !== JSON.stringify(salvos);

  const editar = (fn: (atual: WidgetLayout[]) => WidgetLayout[]) => setRascunho((r) => fn(r ?? salvos ?? []));

  return {
    carregando: consulta.isLoading,
    erro: consulta.error,
    personalizado: consulta.data?.personalizado ?? false,
    widgets,
    catalogo,
    editando: rascunho !== null,
    alterado,
    salvando: salvar.isPending || restaurar.isPending,
    erroSalvar: salvar.error ?? restaurar.error,

    iniciarEdicao: () => {
      salvar.reset();
      restaurar.reset();
      setRascunho(salvos ?? []);
    },
    sairSemSalvar: () => setRascunho(null),
    salvar: () => rascunho && salvar.mutate(rascunho),
    restaurarPadrao: () => restaurar.mutate(),

    /** Posições/tamanhos vindos do grid. */
    definirWidgets: (widgets: WidgetLayout[]) => setRascunho(widgets),
    trocarVisualizacao: (id: string, tipo: Visualizacao) =>
      editar((ws) => ws.map((w) => (w.id === id ? { ...w, tipo_visualizacao: tipo } : w))),
    ocultar: (id: string) => editar((ws) => ws.map((w) => (w.id === id ? { ...w, visivel: false } : w))),
    remover: (id: string) => editar((ws) => ws.filter((w) => w.id !== id)),
    /** Um widget oculto volta numa posição livre (a antiga pode ter sido ocupada). */
    mostrar: (id: string) =>
      editar((ws) => {
        const alvo = ws.find((w) => w.id === id);
        if (!alvo) return ws;
        const pos = posicaoLivre(ocupadosVisiveis(ws), alvo.tamanho.largura_colunas, alvo.tamanho.altura_linhas);
        return ws.map((w) => (w.id === id ? { ...w, visivel: true, posicao: pos } : w));
      }),
    adicionar: (dado: DadoCatalogo, tipo: Visualizacao) =>
      editar((ws) => {
        const { largura_colunas: w, altura_linhas: h } = dado.tamanho_padrao;
        return [
          ...ws,
          {
            id: novoId(dado.tipo_dado, new Set(ws.map((x) => x.id))),
            tipo_dado: dado.tipo_dado,
            tipo_visualizacao: tipo,
            posicao: posicaoLivre(ocupadosVisiveis(ws), w, h),
            tamanho: { largura_colunas: w, altura_linhas: h },
            visivel: true,
          },
        ];
      }),
  };
}

export type Painel = ReturnType<typeof usePainel>;
