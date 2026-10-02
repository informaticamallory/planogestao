import { useEffect, useId, useRef, type ReactNode } from "react";

import styles from "./Modal.module.css";

interface ModalProps {
  aberto: boolean;
  titulo: string;
  onFechar: () => void;
  acoes: ReactNode;
  children: ReactNode;
}

/** Diálogo modal centralizado sobre <dialog> (foco preso e Esc nativos). */
export function Modal({ aberto, titulo, onFechar, acoes, children }: ModalProps) {
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
      className={styles.modal}
      aria-labelledby={idTitulo}
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
