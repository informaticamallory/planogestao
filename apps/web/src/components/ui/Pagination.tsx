import { Button } from "./Button";
import styles from "./Pagination.module.css";
import { Select } from "./Select";

interface PaginationProps {
  pagina: number;
  tamanho: number;
  total: number;
  tamanhos: number[];
  onPagina: (pagina: number) => void;
  onTamanho: (tamanho: number) => void;
}

/** Páginas exibidas: primeira, última e uma janela de ±2 em torno da atual. */
function paginasVisiveis(atual: number, ultima: number): (number | "…")[] {
  const numeros = new Set([1, ultima, ...Array.from({ length: 5 }, (_, i) => atual - 2 + i)]);
  const ordenadas = [...numeros].filter((n) => n >= 1 && n <= ultima).sort((a, b) => a - b);
  const resultado: (number | "…")[] = [];
  ordenadas.forEach((n, i) => {
    if (i > 0 && n - ordenadas[i - 1]! > 1) resultado.push("…");
    resultado.push(n);
  });
  return resultado;
}

export function Pagination({ pagina, tamanho, total, tamanhos, onPagina, onTamanho }: PaginationProps) {
  const ultima = Math.max(1, Math.ceil(total / tamanho));
  const inicio = total === 0 ? 0 : (pagina - 1) * tamanho + 1;
  const fim = Math.min(pagina * tamanho, total);

  return (
    <nav className={styles.paginacao} aria-label="Paginação">
      <span className={styles.resumo}>
        {total === 0 ? "Nenhum resultado" : `${inicio}–${fim} de ${total}`}
      </span>

      <div className={styles.paginas}>
        <Button tamanho="sm" onClick={() => onPagina(pagina - 1)} disabled={pagina <= 1}>
          Anterior
        </Button>
        {paginasVisiveis(pagina, ultima).map((p, i) =>
          p === "…" ? (
            <span key={`r${i}`} className={styles.reticencias}>
              …
            </span>
          ) : (
            <Button
              key={p}
              tamanho="sm"
              variante={p === pagina ? "primaria" : "secundaria"}
              className={styles.numero}
              onClick={() => onPagina(p)}
              aria-current={p === pagina ? "page" : undefined}
            >
              {p}
            </Button>
          ),
        )}
        <Button tamanho="sm" onClick={() => onPagina(pagina + 1)} disabled={pagina >= ultima}>
          Próxima
        </Button>
      </div>

      <label className={styles.tamanho}>
        Por página
        <Select compacto className={styles.seletorTamanho} value={tamanho} onChange={(e) => onTamanho(Number(e.target.value))}>
          {tamanhos.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </label>
    </nav>
  );
}
