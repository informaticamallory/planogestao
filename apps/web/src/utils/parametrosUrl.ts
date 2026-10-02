/**
 * Converte objetos de filtro <-> querystring (listas viram parâmetros repetidos: status=a&status=b).
 * Valores vazios (undefined, "", [], false) não entram na URL.
 */
type Valor = string | number | boolean | undefined | null | (string | number)[];

export function objetoParaParams(obj: Record<string, Valor>): URLSearchParams {
  const p = new URLSearchParams();
  for (const [chave, valor] of Object.entries(obj)) {
    if (Array.isArray(valor)) valor.forEach((v) => p.append(chave, String(v)));
    else if (valor !== undefined && valor !== null && valor !== "" && valor !== false) p.set(chave, String(valor));
  }
  return p;
}

export type Esquema = Record<string, "texto" | "numero" | "lista" | "booleano">;

/** Lê só as chaves do esquema, já tipadas (números inválidos são descartados). */
export function paramsParaObjeto(params: URLSearchParams, esquema: Esquema): Record<string, Valor> {
  const obj: Record<string, Valor> = {};
  for (const [chave, tipo] of Object.entries(esquema)) {
    if (tipo === "lista") {
      const lista = params.getAll(chave).filter(Boolean);
      if (lista.length) obj[chave] = lista;
    } else if (tipo === "numero") {
      const n = Number(params.get(chave));
      if (params.get(chave) && Number.isInteger(n) && n > 0) obj[chave] = n;
    } else if (tipo === "booleano") {
      if (params.get(chave) === "true") obj[chave] = true;
    } else if (params.get(chave)) {
      obj[chave] = params.get(chave)!;
    }
  }
  return obj;
}

/** Igualdade de filtros ignorando a ordem das listas e valores vazios. */
export function mesmosFiltros(a: Record<string, Valor>, b: Record<string, Valor>): boolean {
  const normalizar = (o: Record<string, Valor>) => {
    const p = objetoParaParams(o);
    return [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join("&");
  };
  return normalizar(a) === normalizar(b);
}
