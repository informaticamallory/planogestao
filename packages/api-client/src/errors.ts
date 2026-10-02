type DetalheValidacao = { loc?: unknown[]; msg?: string };

/** Erro de API normalizado (web e mobile tratam da mesma forma). */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(extrairMensagem(status, body));
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/** Retorna `data` de uma resposta do openapi-fetch ou lança ApiError. */
export function exigirDados<T>(resultado: { data?: T; error?: unknown; response: Response }): T {
  if (resultado.data === undefined) throw new ApiError(resultado.response.status, resultado.error);
  return resultado.data;
}

/** Para respostas sem corpo (204): só verifica o sucesso. */
export function exigirSucesso(resultado: { error?: unknown; response: Response }): void {
  if (!resultado.response.ok) throw new ApiError(resultado.response.status, resultado.error);
}

function extrairMensagem(status: number, body: unknown): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    // "Value error, " é o prefixo que o Pydantic põe nas mensagens dos nossos validadores.
    const msgs = (detail as DetalheValidacao[]).map((d) => d.msg?.replace(/^Value error, /, "")).filter(Boolean);
    if (msgs.length) return msgs.join("; ");
  }
  if (status === 0) return "Não foi possível conectar ao servidor.";
  return `Erro inesperado (${status}).`;
}
