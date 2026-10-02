import type { Visualizacao } from "@planogestao/shared-types";
import type { ReactNode } from "react";

import type { KpiTom } from "../ui/KpiCard";

/** Uma categoria com total e cor (partes de um todo: status, situação de prazo...). */
export interface Categoria {
  id: string;
  nome: string;
  total: number;
  token: string;
}

export interface SerieDef {
  chave: string;
  nome: string;
  token: string;
}

/**
 * Formas de dado que um widget sabe desenhar. Cada tipo_dado converte a resposta do seu endpoint
 * (Fases 2 e 9, sem mudança) para uma destas formas; a visualização escolhida só decide COMO mostrar.
 */
export type ConteudoWidget =
  | {
      forma: "numero";
      valor: string;
      /** 0–100: habilita o medidor (gauge). */
      percentual?: number | null;
      detalhe?: string;
      destino?: string;
      corToken?: string;
      tom?: KpiTom;
    }
  | { forma: "categorias"; itens: Categoria[]; rotuloTotal: string; rotuloValor: string }
  | {
      forma: "serie";
      /** Um ponto por intervalo: `rotulo` curto no eixo, `descricao` completa na tabela/tooltip. */
      pontos: ({ rotulo: string; descricao: string } & Record<string, number | string>)[];
      series: SerieDef[];
      rotuloIntervalo: string;
    }
  | { forma: "empilhado"; grupos: ({ nome: string } & Record<string, number | string | null>)[]; series: SerieDef[]; rotuloGrupo: string }
  /** Listas com links e o calendário: conteúdo próprio, só em uma visualização. */
  | { forma: "personalizado"; conteudo: ReactNode };

export interface ResultadoFonte {
  conteudo?: ConteudoWidget;
  isLoading: boolean;
  error: unknown;
  atualizando?: boolean;
  vazio?: boolean;
  mensagemVazio?: string;
  /** Ações no cabeçalho do widget (ex.: "Ver todos"). */
  acoes?: ReactNode;
}

/** De onde vem o dado de um tipo_dado. `useDado` é um hook (chamado só pelos widgets visíveis). */
export interface FonteWidget {
  useDado: () => ResultadoFonte;
}

export type Fontes = Partial<Record<string, FonteWidget>>;

export const ROTULO_VISUALIZACAO: Record<Visualizacao, string> = {
  card_numero: "Card numérico",
  gauge: "Medidor (gauge)",
  grafico_barra: "Gráfico de barras",
  grafico_linha: "Gráfico de linha",
  grafico_pizza: "Gráfico de pizza",
  grafico_rosca: "Gráfico de rosca",
  tabela: "Tabela",
  lista: "Lista",
  calendario: "Calendário",
};
