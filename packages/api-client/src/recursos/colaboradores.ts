import type { HttpClient } from "../client";
import { exigirDados } from "../errors";

export interface NovoConvite {
  nome: string;
  email: string;
  area_id: number;
  setor_id?: number | null;
  areas_autorizadas: number[];
  todas_areas: boolean;
}

/** Página Colaboradores: convites de primeiro acesso (perfil Colaborador, nas áreas de quem convida). */
export function criarColaboradores(http: HttpClient) {
  const convite = (id: number) => ({ params: { path: { convite_id: id } } });
  return {
    opcoes: async () => exigirDados(await http.GET("/colaboradores/opcoes")),
    listar: async () => exigirDados(await http.GET("/colaboradores/convites")),
    convidar: async (corpo: NovoConvite) => exigirDados(await http.POST("/colaboradores/convites", { body: corpo })),
    reenviar: async (id: number) => exigirDados(await http.POST("/colaboradores/convites/{convite_id}/reenviar", convite(id))),
    cancelar: async (id: number) => exigirDados(await http.POST("/colaboradores/convites/{convite_id}/cancelar", convite(id))),
  };
}
