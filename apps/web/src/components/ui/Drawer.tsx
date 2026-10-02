import { useEffect, useRef, type ReactNode } from "react";

import { Button } from "./Button";
import { Icon } from "./Icon";
import styles from "./Drawer.module.css";

interface DrawerProps {
  aberto: boolean;
  titulo: string;
  onFechar: () => void;
  rodape?: ReactNode;
  /** Largura máxima em px (padrão 420). */
  largura?: number;
  /** Conteúdo extra no cabeçalho, ao lado do título (ex.: link "abrir em página"). */
  acoesCabecalho?: ReactNode;
  children: ReactNode;
}

/** Painel lateral modal sobre <dialog>: foco preso, Esc fecha e o fundo fica inerte. */
export function Drawer({ aberto, titulo, onFechar, rodape, largura = 420, acoesCabecalho, children }: DrawerProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;
    if (aberto && !dialogo.open) dialogo.showModal();
    if (!aberto && dialogo.open) dialogo.close();
  }, [aberto]);

  return (
    <dialog
      ref={ref}
      className={styles.drawer}
      style={{ width: `min(${largura}px, 100vw)` }}
      aria-labelledby="drawer-titulo"
      onClose={onFechar}
      // Clique no backdrop (o próprio <dialog>, fora do conteúdo) fecha.
      onClick={(e) => e.target === ref.current && onFechar()}
    >
      <div className={styles.conteudo}>
        <header className={styles.cabecalho}>
          <h2 id="drawer-titulo" className={styles.titulo}>
            {titulo}
          </h2>
          {acoesCabecalho && <div className={styles.acoesCabecalho}>{acoesCabecalho}</div>}
          <Button variante="icone" onClick={onFechar} aria-label="Fechar">
            <Icon name="x" size={17} />
          </Button>
        </header>
        <div className={styles.corpo}>{children}</div>
        {rodape && <footer className={styles.rodape}>{rodape}</footer>}
      </div>
    </dialog>
  );
}
