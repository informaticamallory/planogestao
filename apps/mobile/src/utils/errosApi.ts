import { ApiError } from "@planogestao/api-client";

import { mensagemDeErro } from "../hooks/useAuth";

/**
 * Erros de uma resposta da API prontos para o formulário:
 * - 422 do Pydantic (detail = [{loc: ["body", "email"], msg}]) → mensagem sob o campo correspondente,
 *   com o mesmo texto que o backend define (sem o prefixo técnico "Value error, ");
 * - demais (409 duplicado, 422 de regra, 403...) → mensagem geral, igual à do web.
 */
export function errosDaApi(erro: unknown, apelidos: Record<string, string> = {}): { campos: Record<string, string>; geral: string | null } {
  if (!erro) return { campos: {}, geral: null };
  if (!(erro instanceof ApiError)) return { campos: {}, geral: mensagemDeErro(erro) };

  const detail = (erro.body as { detail?: unknown } | null)?.detail;
  if (erro.status === 422 && Array.isArray(detail)) {
    const campos: Record<string, string> = {};
    const soltos: string[] = [];
    for (const d of detail as { loc?: unknown[]; msg?: string }[]) {
      const msg = (d.msg ?? "").replace(/^Value error, /, "");
      const loc = (d.loc ?? []).filter((p) => p !== "body");
      const campo = typeof loc[0] === "string" ? (apelidos[loc[0]] ?? loc[0]) : null;
      if (campo && !campos[campo]) campos[campo] = msg;
      else soltos.push(msg);
    }
    return { campos, geral: soltos.length ? soltos.join("; ") : null };
  }
  return { campos: {}, geral: erro.message };
}
