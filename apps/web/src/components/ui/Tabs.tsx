import { useRef, type KeyboardEvent, type ReactNode } from "react";

import styles from "./Tabs.module.css";

export interface TabItem<T extends string> {
  id: T;
  rotulo: string;
  contador?: number;
}

interface TabsProps<T extends string> {
  abas: TabItem<T>[];
  ativa: T;
  onSelecionar: (id: T) => void;
  rotulo: string;
  children: ReactNode;
}

/** Ponto de substituição das abas do UIKit. Padrão ARIA (tablist/tab/tabpanel), com setas/Home/End para navegar. */
export function Tabs<T extends string>({ abas, ativa, onSelecionar, rotulo, children }: TabsProps<T>) {
  const botoes = useRef<(HTMLButtonElement | null)[]>([]);

  const aoTeclar = (e: KeyboardEvent, indice: number) => {
    const destinos: Record<string, number> = {
      ArrowRight: (indice + 1) % abas.length,
      ArrowLeft: (indice - 1 + abas.length) % abas.length,
      Home: 0,
      End: abas.length - 1,
    };
    const destino = destinos[e.key];
    if (destino === undefined) return;
    e.preventDefault();
    onSelecionar(abas[destino]!.id);
    botoes.current[destino]?.focus();
  };

  return (
    <div className={styles.abas}>
      <div role="tablist" aria-label={rotulo} className={styles.lista}>
        {abas.map((aba, i) => {
          const selecionada = aba.id === ativa;
          return (
            <button
              key={aba.id}
              ref={(el) => {
                botoes.current[i] = el;
              }}
              id={`aba-${aba.id}`}
              role="tab"
              type="button"
              aria-selected={selecionada}
              aria-controls={`painel-${aba.id}`}
              tabIndex={selecionada ? 0 : -1}
              className={selecionada ? `${styles.aba} ${styles.abaAtiva}` : styles.aba}
              onClick={() => onSelecionar(aba.id)}
              onKeyDown={(e) => aoTeclar(e, i)}
            >
              {aba.rotulo}
              {aba.contador !== undefined && <span className={styles.contador}>{aba.contador}</span>}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={`painel-${ativa}`} aria-labelledby={`aba-${ativa}`} className={styles.painel} tabIndex={0}>
        {children}
      </div>
    </div>
  );
}
