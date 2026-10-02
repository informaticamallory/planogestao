import type { ReactNode } from "react";

import { Icon } from "./Icon";
import styles from "./Wizard.module.css";

/** "abas": uma seção por vez, com o indicador no topo. "geral": todas as seções empilhadas. */
export type ModoWizard = "abas" | "geral";

export interface SecaoWizard {
  titulo: string;
  conteudo: ReactNode;
  /** Há campos obrigatórios em aberto (só sinaliza; não bloqueia a navegação). */
  pendente?: boolean;
  /** Os erros desta seção já foram exibidos (tentativa de salvar). */
  comErro?: boolean;
}

interface WizardProps {
  secoes: SecaoWizard[];
  /** Índice (0-based) da seção exibida no modo "abas". */
  atual: number;
  /** Qualquer seção pode ser aberta pelo indicador, a qualquer momento. */
  onIrPara: (indice: number) => void;
  modo?: ModoWizard;
  rodape: ReactNode;
}

/**
 * As seções ficam sempre montadas (as inativas só são escondidas) e a árvore é a mesma nos dois
 * modos: trocar de aba ou de modo não desmonta nada, então nenhum dado digitado se perde.
 */
export function Wizard({ secoes, atual, onIrPara, modo = "abas", rodape }: WizardProps) {
  const geral = modo === "geral";

  return (
    <div className={`${styles.wizard} ${geral ? styles.geral : ""}`}>
      {geral ? null : (
        <ol className={styles.indicador} aria-label={`Etapa ${atual + 1} de ${secoes.length}`}>
          {secoes.map((s, i) => {
            const estado = i === atual ? "atual" : s.pendente ? "pendente" : "concluida";
            return (
              <li key={s.titulo} className={`${styles.passo} ${styles[estado]}`}>
                <button
                  type="button"
                  className={styles.botaoPasso}
                  onClick={() => onIrPara(i)}
                  aria-current={i === atual ? "step" : undefined}
                  title={s.pendente ? "Há campos obrigatórios pendentes nesta etapa" : undefined}
                >
                  <span className={styles.numero}>
                    {estado === "concluida" ? <Icon name="check" size={15} strokeWidth={2.4} /> : i + 1}
                    {s.pendente && <span className={`${styles.marcaPendente} ${s.comErro ? styles.marcaErro : ""}`} aria-hidden="true" />}
                  </span>
                  <span className={styles.tituloPasso}>{s.titulo}</span>
                  {s.pendente && <span className="sr-only"> (campos obrigatórios pendentes)</span>}
                </button>
              </li>
            );
          })}
        </ol>
      )}

      <div className={styles.secoes}>
        {secoes.map((s, i) => (
          <section
            key={s.titulo}
            className={styles.conteudo}
            hidden={!geral && i !== atual}
            aria-labelledby={geral ? `secao-wizard-${i}` : undefined}
          >
            {geral ? (
              <h2 id={`secao-wizard-${i}`} className={styles.tituloSecao}>
                {i + 1}. {s.titulo}
                {s.pendente && (
                  <span className={`${styles.seloPendente} ${s.comErro ? styles.seloErro : ""}`}>Campos obrigatórios pendentes</span>
                )}
              </h2>
            ) : null}
            <div>{s.conteudo}</div>
          </section>
        ))}
      </div>

      <footer className={styles.rodape}>{rodape}</footer>
    </div>
  );
}
