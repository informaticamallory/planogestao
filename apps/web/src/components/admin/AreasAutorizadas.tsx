import { useEffect, useId, useRef, useState } from "react";

import styles from "./AreasAutorizadas.module.css";

export interface AreaOpcao {
  id: number;
  nome: string;
  ativo: boolean;
}

export interface SelecaoAreas {
  /** "Todas as áreas": inclui as que forem cadastradas depois. */
  todas: boolean;
  ids: number[];
}

interface Props {
  id: string;
  areas: AreaOpcao[];
  valor: SelecaoAreas;
  onChange: (valor: SelecaoAreas) => void;
  /** Administrador: todas as áreas sem seleção. */
  automatico?: boolean;
  invalido?: boolean;
  idDescricao?: string;
}

/**
 * Seleção múltipla compacta: etiquetas dentro do campo; ao abrir, busca e lista com rolagem
 * (inline, para não ser cortada pelo modal). Área inativa só aparece se já estava autorizada.
 */
export function AreasAutorizadas({ id, areas, valor, onChange, automatico, invalido, idDescricao }: Props) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const raiz = useRef<HTMLDivElement>(null);
  const idLista = useId();

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => !raiz.current?.contains(e.target as Node) && setAberto(false);
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  if (automatico) {
    return (
      <div id={id} className={`${styles.campo} ${styles.automatico}`} aria-describedby={idDescricao}>
        <span className={styles.etiqueta}>Todas as áreas — automático</span>
      </div>
    );
  }

  const marcadas = new Set(valor.ids);
  const visiveis = areas.filter((a) => a.ativo || marcadas.has(a.id));
  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const filtradas = termo ? visiveis.filter((a) => a.nome.toLocaleLowerCase("pt-BR").includes(termo)) : visiveis;
  const nome = (areaId: number) => areas.find((a) => a.id === areaId)?.nome ?? `Área ${areaId}`;
  const alternar = (areaId: number) =>
    onChange({ todas: false, ids: marcadas.has(areaId) ? valor.ids.filter((x) => x !== areaId) : [...valor.ids, areaId] });

  return (
    <div ref={raiz} className={styles.raiz} onKeyDown={(e) => e.key === "Escape" && aberto && (e.stopPropagation(), setAberto(false))}>
      <div
        id={id}
        role="button"
        tabIndex={0}
        aria-expanded={aberto}
        aria-controls={idLista}
        aria-invalid={invalido || undefined}
        aria-describedby={idDescricao}
        className={`${styles.campo} ${invalido ? styles.invalido : ""}`}
        onClick={() => setAberto((a) => !a)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
            e.preventDefault();
            setAberto(true);
          }
        }}
      >
        {valor.todas ? (
          <Etiqueta texto="Todas as áreas" onRemover={() => onChange({ todas: false, ids: valor.ids })} />
        ) : valor.ids.length ? (
          valor.ids.map((x) => <Etiqueta key={x} texto={nome(x)} onRemover={() => alternar(x)} />)
        ) : (
          <span className={styles.vazio}>Nenhuma área — selecione</span>
        )}
        <span className={styles.seta} aria-hidden="true">
          ▾
        </span>
      </div>

      {aberto && (
        <div className={styles.painel}>
          <input
            type="search"
            className={styles.busca}
            placeholder="Buscar área…"
            aria-label="Buscar área"
            value={busca}
            autoFocus
            onChange={(e) => setBusca(e.target.value)}
          />
          <ul id={idLista} role="listbox" aria-multiselectable="true" aria-label="Áreas autorizadas" className={styles.lista}>
            <li role="option" aria-selected={valor.todas} className={styles.todas}>
              <label>
                <input type="checkbox" checked={valor.todas} onChange={(e) => onChange({ todas: e.target.checked, ids: valor.ids })} />
                Todas as áreas <span className={styles.dica}>(inclui as futuras)</span>
              </label>
            </li>
            {filtradas.map((a) => (
              <li key={a.id} role="option" aria-selected={valor.todas || marcadas.has(a.id)} aria-disabled={valor.todas || undefined}>
                <label className={valor.todas ? styles.desabilitado : undefined}>
                  <input type="checkbox" checked={valor.todas || marcadas.has(a.id)} disabled={valor.todas} onChange={() => alternar(a.id)} />
                  {a.nome}
                  {!a.ativo && <span className={styles.dica}> (inativa)</span>}
                </label>
              </li>
            ))}
            {!filtradas.length && <li className={styles.semResultado}>Nenhuma área encontrada.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

function Etiqueta({ texto, onRemover }: { texto: string; onRemover: () => void }) {
  return (
    <span className={styles.etiqueta}>
      {texto}
      <button
        type="button"
        className={styles.remover}
        aria-label={`Remover ${texto}`}
        onClick={(e) => {
          e.stopPropagation();
          onRemover();
        }}
        onKeyDown={(e) => e.stopPropagation()}
      >
        ×
      </button>
    </span>
  );
}
