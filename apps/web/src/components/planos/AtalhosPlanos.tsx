import type { StatusFiltroPlano, TagPrazo } from "@planogestao/shared-types";

import type { FiltrosPlanosUrl } from "../../hooks/useFiltrosPlanos";
import styles from "./AtalhosPlanos.module.css";

type Parcial = Pick<FiltrosPlanosUrl, "status" | "prazo" | "rascunho" | "meus">;

interface Atalho extends Parcial {
  id: string;
  rotulo: string;
}

const base: Parcial = { status: [], prazo: [], rascunho: false, meus: false };

// Status global e situação do prazo são independentes: "Em atraso" filtra pela tag, não pelo status.
const ATALHOS: Atalho[] = [
  { id: "todos", rotulo: "Todos", ...base },
  { id: "meus", rotulo: "Meus Planos", ...base, meus: true },
  { id: "nao_iniciados", rotulo: "Não iniciados", ...base, status: ["nao_iniciado"] },
  { id: "em_andamento", rotulo: "Em andamento", ...base, status: ["em_andamento"] },
  { id: "concluidos", rotulo: "Concluídos", ...base, status: ["concluido"] },
  { id: "em_atraso", rotulo: "Em atraso", ...base, prazo: ["em_atraso"] },
  { id: "a_vencer", rotulo: "A vencer", ...base, prazo: ["a_vencer"] },
  { id: "rascunhos", rotulo: "Rascunhos", ...base, rascunho: true },
];

const mesmos = <T,>(a: T[], b: T[]) => a.length === b.length && a.every((x) => b.includes(x));

function atalhoAtivo(f: FiltrosPlanosUrl): string | null {
  const encontrado = ATALHOS.find(
    (a) =>
      a.meus === f.meus &&
      a.rascunho === f.rascunho &&
      mesmos<StatusFiltroPlano>(a.status, f.status) &&
      mesmos<TagPrazo>(a.prazo, f.prazo),
  );
  return encontrado?.id ?? null;
}

/** Atalhos ajustam só status, prazo, rascunho e "meus"; os demais filtros (busca, área...) são mantidos. */
export function AtalhosPlanos({ filtros, onSelecionar }: { filtros: FiltrosPlanosUrl; onSelecionar: (parcial: Parcial) => void }) {
  const ativo = atalhoAtivo(filtros);
  return (
    <nav className={styles.atalhos} aria-label="Atalhos de filtro">
      {ATALHOS.map(({ id, rotulo, ...parcial }) => (
        <button
          key={id}
          type="button"
          className={id === ativo ? `${styles.atalho} ${styles.atalhoAtivo}` : styles.atalho}
          aria-pressed={id === ativo}
          onClick={() => onSelecionar(parcial)}
        >
          {rotulo}
        </button>
      ))}
    </nav>
  );
}
