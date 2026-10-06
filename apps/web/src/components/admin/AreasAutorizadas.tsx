import { useEffect, useId, useRef, useState } from "react";

import controles from "../ui/Input.module.css";
import styles from "./AreasAutorizadas.module.css";

export interface AreaOpcao {
  id: number;
  nome: string;
  ativo?: boolean;
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
  /** Esconde "Todas as áreas" (quem convida sem ter essa abrangência). */
  semTodas?: boolean;
  invalido?: boolean;
}

/** Resumo de uma linha, como o texto de um select: nunca quebra (o excesso vira reticências). */
export function resumoAreas(valor: SelecaoAreas, areas: AreaOpcao[]): string {
  if (valor.todas) return "Todas as áreas";
  if (valor.ids.length === 0) return "Selecione...";
  if (valor.ids.length === 1) return areas.find((a) => a.id === valor.ids[0])?.nome ?? "1 área selecionada";
  return `${valor.ids.length} áreas selecionadas`;
}

/**
 * Seleção múltipla com a aparência dos selects do kit (mesma altura, borda, fonte e espaçamento).
 * Ao abrir: busca e caixas de seleção numa lista com rolagem. Área inativa só aparece se já estava autorizada.
 */
export function AreasAutorizadas({ id, areas, valor, onChange, automatico, semTodas, invalido }: Props) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const raiz = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const idLista = useId();

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => !raiz.current?.contains(e.target as Node) && setAberto(false);
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  if (automatico) {
    return (
      <button type="button" id={id} className={`${controles.controle} ${styles.campo}`} disabled aria-label="Áreas autorizadas: todas as áreas, automático">
        <span className={styles.resumo}>Todas as áreas — automático</span>
      </button>
    );
  }

  const marcadas = new Set(valor.ids);
  const visiveis = areas.filter((a) => a.ativo !== false || marcadas.has(a.id));
  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const filtradas = termo ? visiveis.filter((a) => a.nome.toLocaleLowerCase("pt-BR").includes(termo)) : visiveis;
  const alternar = (areaId: number) =>
    onChange({ todas: false, ids: marcadas.has(areaId) ? valor.ids.filter((x) => x !== areaId) : [...valor.ids, areaId] });
  const resumo = resumoAreas(valor, areas);
  const fechar = () => {
    setAberto(false);
    botao.current?.focus();
  };

  return (
    <div
      ref={raiz}
      className={styles.raiz}
      onKeyDown={(e) => {
        if (e.key === "Escape" && aberto) {
          // Fecha só a lista, não o modal.
          e.stopPropagation();
          e.preventDefault();
          fechar();
        }
      }}
    >
      <button
        ref={botao}
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-controls={aberto ? idLista : undefined}
        aria-invalid={invalido || undefined}
        className={`${controles.controle} ${styles.campo} ${valor.todas || valor.ids.length ? "" : styles.placeholder}`}
        title={valor.ids.length > 1 && !valor.todas ? areas.filter((a) => marcadas.has(a.id)).map((a) => a.nome).join(", ") : undefined}
        onClick={() => setAberto((a) => !a)}
      >
        <span className={styles.resumo}>{resumo}</span>
        <svg className={styles.seta} viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

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
            {!semTodas && (
              <li role="option" aria-selected={valor.todas} className={styles.todas}>
                <label>
                  <input type="checkbox" checked={valor.todas} onChange={(e) => onChange({ todas: e.target.checked, ids: valor.ids })} />
                  <span>
                    Todas as áreas <span className={styles.dica}>(inclui as futuras)</span>
                  </span>
                </label>
              </li>
            )}
            {filtradas.map((a) => (
              <li key={a.id} role="option" aria-selected={valor.todas || marcadas.has(a.id)} aria-disabled={valor.todas || undefined}>
                <label className={valor.todas ? styles.desabilitado : undefined}>
                  <input type="checkbox" checked={valor.todas || marcadas.has(a.id)} disabled={valor.todas} onChange={() => alternar(a.id)} />
                  <span>
                    {a.nome}
                    {a.ativo === false && <span className={styles.dica}> (inativa)</span>}
                  </span>
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
