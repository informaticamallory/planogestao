export interface ArquivoBaixado {
  blob: Blob;
  nomeArquivo: string;
}

/** Nome do arquivo informado pelo backend em Content-Disposition (exposto via CORS). */
export function nomeDoArquivo(response: Response, padrao: string): string {
  const cabecalho = response.headers.get("Content-Disposition") ?? "";
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(cabecalho);
  if (utf8?.[1]) return decodeURIComponent(utf8[1]);
  const simples = /filename="?([^";]+)"?/i.exec(cabecalho);
  return simples?.[1] ?? padrao;
}
