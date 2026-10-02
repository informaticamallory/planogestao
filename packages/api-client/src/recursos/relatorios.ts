import type { FormatoExportacao, RelatorioAcoes, RelatorioPlanos, operations } from "@planogestao/shared-types";
import { createQuerySerializer } from "openapi-fetch";

import { nomeDoArquivo, type ArquivoBaixado } from "../arquivos";
import type { HttpClient } from "../client";
import { ApiError, exigirDados } from "../errors";

export type ConsultaRelatorioPlanos = NonNullable<operations["relatorio_planos_relatorios_planos_get"]["parameters"]["query"]>;
export type ConsultaRelatorioAcoes = NonNullable<operations["relatorio_acoes_relatorios_acoes_get"]["parameters"]["query"]>;

type SemPaginacao<T> = Omit<T, "page" | "page_size">;

// Mesmo serializador padrão que o openapi-fetch usa nas requisições (arrays como status=a&status=b).
const serializar = createQuerySerializer();

export function criarRelatorios(http: HttpClient, baseUrl: string) {
  /**
   * URL completa da exportação, idêntica à requisição feita por `baixar` — para quem baixa o arquivo
   * fora do fetch (app mobile: download nativo direto para o disco, com o header Authorization).
   */
  function urlExportacao(caminho: "/relatorios/planos/exportar" | "/relatorios/acoes/exportar", filtros: object, formato: FormatoExportacao) {
    const { page: _p, page_size: _ps, ...semPaginacao } = filtros as Record<string, unknown>;
    const query = serializar({ ...semPaginacao, formato });
    return `${baseUrl}${caminho}${query ? `?${query}` : ""}`;
  }

  /** Exportação: os mesmos filtros da pré-visualização, sem paginação (o arquivo leva tudo). */
  async function baixar(
    caminho: "/relatorios/planos/exportar" | "/relatorios/acoes/exportar",
    filtros: object,
    formato: FormatoExportacao,
    padrao: string,
  ): Promise<ArquivoBaixado> {
    const { page: _p, page_size: _ps, ...semPaginacao } = filtros as Record<string, unknown>;
    const { data, error, response } = await http.GET(caminho, {
      // O tipo gerado é uma união por rota; os filtros já vêm validados pelo tipo público abaixo.
      params: { query: { ...semPaginacao, formato } as never },
      parseAs: "blob",
    });
    if (!data) throw new ApiError(response.status, error);
    return { blob: data as unknown as Blob, nomeArquivo: nomeDoArquivo(response, `${padrao}.${formato}`) };
  }

  return {
    planos: async (consulta: ConsultaRelatorioPlanos): Promise<RelatorioPlanos> =>
      exigirDados(await http.GET("/relatorios/planos", { params: { query: consulta } })),

    acoes: async (consulta: ConsultaRelatorioAcoes): Promise<RelatorioAcoes> =>
      exigirDados(await http.GET("/relatorios/acoes", { params: { query: consulta } })),

    exportarPlanos: (filtros: SemPaginacao<ConsultaRelatorioPlanos>, formato: FormatoExportacao) =>
      baixar("/relatorios/planos/exportar", filtros, formato, "planos"),

    exportarAcoes: (filtros: SemPaginacao<ConsultaRelatorioAcoes>, formato: FormatoExportacao) =>
      baixar("/relatorios/acoes/exportar", filtros, formato, "acoes"),

    urlExportacaoPlanos: (filtros: SemPaginacao<ConsultaRelatorioPlanos>, formato: FormatoExportacao) =>
      urlExportacao("/relatorios/planos/exportar", filtros, formato),

    urlExportacaoAcoes: (filtros: SemPaginacao<ConsultaRelatorioAcoes>, formato: FormatoExportacao) =>
      urlExportacao("/relatorios/acoes/exportar", filtros, formato),
  };
}
