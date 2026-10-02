import type {
  CadastroSalvar,
  ModeloEmailSalvar,
  PerfilSalvar,
  SetorSalvar,
  TesteEmailPedido,
  TextoModeloEmail,
  UsuarioAtualizar,
  UsuarioCriar,
} from "@planogestao/shared-types";

import type { HttpClient } from "../client";
import { exigirDados, exigirSucesso } from "../errors";

export interface ConsultaUsuariosAdmin {
  q?: string;
  perfil_id?: number;
  area_id?: number;
  ativo?: boolean;
  page?: number;
  page_size?: number;
}

/** Módulo Administração: todas as rotas exigem o perfil Administrador (403 para os demais). */
export function criarAdministracao(http: HttpClient) {
  const id = <K extends string>(nome: K, valor: number) => ({ params: { path: { [nome]: valor } as Record<K, number> } });
  return {
    usuarios: {
      listar: async (q: ConsultaUsuariosAdmin = {}) => exigirDados(await http.GET("/usuarios", { params: { query: q } })),
      detalhe: async (usuarioId: number) => exigirDados(await http.GET("/usuarios/{usuario_id}", id("usuario_id", usuarioId))),
      criar: async (body: UsuarioCriar) => exigirDados(await http.POST("/usuarios", { body })),
      atualizar: async (usuarioId: number, body: UsuarioAtualizar) =>
        exigirDados(await http.PUT("/usuarios/{usuario_id}", { ...id("usuario_id", usuarioId), body })),
      /** Inativa (usuários não são apagados). */
      inativar: async (usuarioId: number) => exigirSucesso(await http.DELETE("/usuarios/{usuario_id}", id("usuario_id", usuarioId))),
    },
    perfis: {
      listar: async () => exigirDados(await http.GET("/perfis")),
      detalhe: async (perfilId: number) => exigirDados(await http.GET("/perfis/{perfil_id}", id("perfil_id", perfilId))),
      catalogo: async () => exigirDados(await http.GET("/perfis/permissoes")),
      criar: async (body: PerfilSalvar) => exigirDados(await http.POST("/perfis", { body })),
      atualizar: async (perfilId: number, body: PerfilSalvar) =>
        exigirDados(await http.PUT("/perfis/{perfil_id}", { ...id("perfil_id", perfilId), body })),
      excluir: async (perfilId: number) => exigirSucesso(await http.DELETE("/perfis/{perfil_id}", id("perfil_id", perfilId))),
    },
    areas: {
      listar: async () => exigirDados(await http.GET("/areas")),
      criar: async (body: CadastroSalvar) => exigirDados(await http.POST("/areas", { body })),
      atualizar: async (areaId: number, body: CadastroSalvar) =>
        exigirDados(await http.PUT("/areas/{area_id}", { ...id("area_id", areaId), body })),
      excluir: async (areaId: number) => exigirSucesso(await http.DELETE("/areas/{area_id}", id("area_id", areaId))),
    },
    setores: {
      listar: async (areaId?: number) => exigirDados(await http.GET("/setores", { params: { query: { area_id: areaId } } })),
      criar: async (body: SetorSalvar) => exigirDados(await http.POST("/setores", { body })),
      atualizar: async (setorId: number, body: SetorSalvar) =>
        exigirDados(await http.PUT("/setores/{setor_id}", { ...id("setor_id", setorId), body })),
      excluir: async (setorId: number) => exigirSucesso(await http.DELETE("/setores/{setor_id}", id("setor_id", setorId))),
    },
    tiposPlano: {
      listar: async () => exigirDados(await http.GET("/tipos-plano")),
      criar: async (body: CadastroSalvar) => exigirDados(await http.POST("/tipos-plano", { body })),
      atualizar: async (tipoId: number, body: CadastroSalvar) =>
        exigirDados(await http.PUT("/tipos-plano/{tipo_id}", { ...id("tipo_id", tipoId), body })),
      excluir: async (tipoId: number) => exigirSucesso(await http.DELETE("/tipos-plano/{tipo_id}", id("tipo_id", tipoId))),
      /** Origens compatíveis com o tipo (substitui a lista inteira). */
      definirOrigens: async (tipoId: number, origemIds: number[]) =>
        exigirDados(await http.PUT("/tipos-plano/{tipo_id}/origens", { ...id("tipo_id", tipoId), body: { origem_ids: origemIds } })),
    },
    origens: {
      listar: async () => exigirDados(await http.GET("/origens")),
      criar: async (body: CadastroSalvar) => exigirDados(await http.POST("/origens", { body })),
      atualizar: async (origemId: number, body: CadastroSalvar) =>
        exigirDados(await http.PUT("/origens/{origem_id}", { ...id("origem_id", origemId), body })),
      excluir: async (origemId: number) => exigirSucesso(await http.DELETE("/origens/{origem_id}", id("origem_id", origemId))),
    },
    /** Configurações de e-mail: modelos das notificações, CCO, prévia e e-mail de teste. */
    email: {
      obter: async () => exigirDados(await http.GET("/email-config")),
      salvarModelo: async (evento: string, body: ModeloEmailSalvar) =>
        exigirDados(await http.PUT("/email-config/modelos/{evento}", { params: { path: { evento } }, body })),
      salvarCcoPadrao: async (enderecos: string[]) => exigirDados(await http.PUT("/email-config/cco-padrao", { body: { enderecos } })),
      /** Renderiza o texto informado (salvo ou não) com dados fictícios; não grava nada. */
      previa: async (body: TextoModeloEmail) => exigirDados(await http.POST("/email-config/previa", { body })),
      /** Envia agora, só para `destinatario`, com dados fictícios (sem destinatários reais nem CCO). */
      teste: async (body: TesteEmailPedido) => exigirDados(await http.POST("/email-config/teste", { body })),
    },
    configuracoes: {
      listar: async () => exigirDados(await http.GET("/configuracoes")),
      atualizar: async (chave: string, valor: number) =>
        exigirDados(await http.PUT("/configuracoes/{chave}", { params: { path: { chave } }, body: { valor } })),
      /** Qualquer usuário logado: parâmetros usados em textos da interface. */
      publicas: async () => exigirDados(await http.GET("/configuracoes/publicas")),
    },
  };
}
