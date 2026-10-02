import type {
  AcaoCriar,
  FormatoExportacao,
  PaginaPlanos,
  PlanoAtualizar,
  PlanoCriar,
  operations,
} from "@planogestao/shared-types";

import { nomeDoArquivo, type ArquivoBaixado } from "../arquivos";
import type { HttpClient } from "../client";
import { ApiError, exigirDados } from "../errors";

export type { ArquivoBaixado } from "../arquivos";

/** Query aceita por GET /planos (filtros + ordenação + paginação), exceto `formato`. */
export type ConsultaPlanos = Omit<NonNullable<operations["listar_planos_get"]["parameters"]["query"]>, "formato">;

export function criarPlanos(http: HttpClient) {
  return {
    // O endpoint também serve arquivos (formato=...), então o tipo gerado é uma união;
    // sem `formato` a resposta é sempre a página JSON.
    listar: async (consulta: ConsultaPlanos): Promise<PaginaPlanos> =>
      exigirDados(await http.GET("/planos", { params: { query: consulta } })) as PaginaPlanos,

    /** Mesmos filtros/ordenação da listagem; o backend ignora a paginação. */
    exportar: async (consulta: ConsultaPlanos, formato: FormatoExportacao): Promise<ArquivoBaixado> => {
      const { page: _p, page_size: _ps, ...filtros } = consulta;
      const { data, error, response } = await http.GET("/planos", {
        params: { query: { ...filtros, formato } },
        parseAs: "blob",
      });
      if (!data) throw new ApiError(response.status, error);
      return { blob: data as unknown as Blob, nomeArquivo: nomeDoArquivo(response, `planos.${formato}`) };
    },

    resumo: async (planoId: number) =>
      exigirDados(await http.GET("/planos/{plano_id}/resumo", { params: { path: { plano_id: planoId } } })),

    detalhe: async (planoId: number) =>
      exigirDados(await http.GET("/planos/{plano_id}", { params: { path: { plano_id: planoId } } })),

    atualizar: async (planoId: number, dados: PlanoAtualizar) =>
      exigirDados(await http.PUT("/planos/{plano_id}", { params: { path: { plano_id: planoId } }, body: dados })),

    indicadores: async (planoId: number) =>
      exigirDados(await http.GET("/planos/{plano_id}/indicadores", { params: { path: { plano_id: planoId } } })),

    acoes: async (planoId: number) =>
      exigirDados(await http.GET("/planos/{plano_id}/acoes", { params: { path: { plano_id: planoId } } })),

    historico: async (planoId: number, page = 1, pageSize = 50) =>
      exigirDados(
        await http.GET("/planos/{plano_id}/historico", {
          params: { path: { plano_id: planoId }, query: { page, page_size: pageSize } },
        }),
      ),

    /** Download autenticado (o arquivo nunca fica exposto em URL pública). */
    baixarAnexo: async (planoId: number, anexoId: number): Promise<ArquivoBaixado> => {
      const { data, error, response } = await http.GET("/planos/{plano_id}/anexos/{anexo_id}", {
        params: { path: { plano_id: planoId, anexo_id: anexoId } },
        parseAs: "blob",
      });
      if (!data) throw new ApiError(response.status, error);
      return { blob: data as unknown as Blob, nomeArquivo: nomeDoArquivo(response, "anexo") };
    },

    arquivar: async (planoId: number) =>
      exigirDados(await http.POST("/planos/{plano_id}/arquivar", { params: { path: { plano_id: planoId } } })),

    desarquivar: async (planoId: number) =>
      exigirDados(await http.POST("/planos/{plano_id}/desarquivar", { params: { path: { plano_id: planoId } } })),

    opcoes: async () => exigirDados(await http.GET("/opcoes/planos")),

    /** Origens compatíveis com o tipo escolhido (formulário do plano). */
    origensDoTipo: async (tipoId: number) =>
      exigirDados(await http.GET("/tipos-plano/{tipo_id}/origens", { params: { path: { tipo_id: tipoId } } })),

    /** Cria o plano e suas ações numa única transação. */
    criar: async (dados: PlanoCriar) => exigirDados(await http.POST("/planos", { body: dados })),

    adicionarAcoes: async (planoId: number, acoes: AcaoCriar[]) =>
      exigirDados(await http.POST("/planos/{plano_id}/acoes", { params: { path: { plano_id: planoId } }, body: acoes })),

    enviarAnexos: async (planoId: number, arquivos: File[]) =>
      exigirDados(
        await http.POST("/planos/{plano_id}/anexos", {
          params: { path: { plano_id: planoId } },
          // O schema tipa os arquivos como string (binário); o corpo real é multipart.
          body: { arquivos: arquivos as unknown as string[] },
          bodySerializer: () => {
            const form = new FormData();
            arquivos.forEach((arquivo) => form.append("arquivos", arquivo));
            return form;
          },
        }),
      ),

    listarAnexos: async (planoId: number) =>
      exigirDados(await http.GET("/planos/{plano_id}/anexos", { params: { path: { plano_id: planoId } } })),
  };
}
