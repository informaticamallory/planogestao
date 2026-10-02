/** Endereço da API (o mesmo do api-client). */
export const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

/** Caminhos servidos pela API ("/usuarios/fotos/…") viram URL completa; endereços http(s) ficam como estão. */
export const resolverUrlApi = (url: string) => (url.startsWith("/") ? `${API_URL}${url}` : url);
