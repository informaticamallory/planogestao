import { useEffect, useId, useRef, type ReactNode } from "react";

import styles from "./Modal.module.css";

interface ModalProps {
  aberto: boolean;
  titulo: string;
  onFechar: () => void;
  acoes: ReactNode;
  children: ReactNode;
  /** "media": ~520px (confirmações com mais texto); "larga": duas colunas (ex.: editor de foto). Padrão: 30rem. */
  largura?: "padrao" | "media" | "larga";
  /** Operação em andamento: Esc não fecha (os botões do próprio modal ficam desabilitados). */
  bloquearFechar?: boolean;
}

/** Diálogo modal centralizado sobre <dialog> (foco preso e Esc nativos). */
export function Modal({ aberto, titulo, onFechar, acoes, children, largura = "padrao", bloquearFechar = false }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;
    if (aberto && !dialogo.open) dialogo.showModal();
    if (!aberto && dialogo.open) dialogo.close();
  }, [aberto]);

  return (
    <dialog
      ref={ref}
      className={largura === "padrao" ? styles.modal : `${styles.modal} ${styles[largura]}`}
      aria-labelledby={idTitulo}
      onCancel={(e) => {
        if (bloquearFechar) e.preventDefault();
      }}
      // O modal é uma camada à parte: um clique nele não chega a quem o montou (ex.: a linha clicável da
      // tabela de planos, que abriria o plano ao marcar a confirmação ou clicar em "Cancelar").
      onClick={(e) => e.stopPropagation()}
      onClose={(e) => {
        // No React o "close" propaga pela árvore: sem isto, fechar um modal aberto dentro de um
        // Drawer (também <dialog>) fecharia o Drawer junto.
        e.stopPropagation();
        onFechar();
      }}
    >
      <h2 id={idTitulo} className={styles.titulo}>
        {titulo}
      </h2>
      <div className={styles.corpo}>{children}</div>
      <footer className={styles.acoes}>{acoes}</footer>
    </dialog>
  );
}
