import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";

import styles from "./DropdownMenu.module.css";

interface DropdownMenuProps {
  /** Conteúdo do botão que abre o menu. */
  rotulo: ReactNode;
  /** Nome acessível do botão, quando o rótulo não é texto (ex.: "⋯"). */
  ariaLabel?: string;
  classeBotao?: string;
  alinhamento?: "esquerda" | "direita";
  /** Recebe `fechar` para itens que devem fechar o menu após o clique. */
  children: (fechar: () => void) => ReactNode;
}

export function DropdownMenu({ rotulo, ariaLabel, classeBotao, alinhamento = "direita", children }: DropdownMenuProps) {
  const [posicao, setPosicao] = useState<CSSProperties | null>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const id = useId();
  const aberto = posicao !== null;

  // Painel com position: fixed, ancorado no botão: não é cortado por contêineres com overflow (tabelas).
  const abrir = () => {
    const r = botao.current!.getBoundingClientRect();
    const abaixo = window.innerHeight - r.bottom > 220 || r.top < 220;
    setPosicao({
      ...(abaixo ? { top: r.bottom + 4 } : { bottom: window.innerHeight - r.top + 4 }),
      ...(alinhamento === "direita" ? { right: window.innerWidth - r.right } : { left: r.left }),
    });
  };
  const fechar = () => setPosicao(null);

  useEffect(() => {
    if (!aberto) return;
    const aoClicarFora = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) fechar();
    };
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") fechar();
    };
    document.addEventListener("mousedown", aoClicarFora);
    document.addEventListener("keydown", aoTeclar);
    // A posição fixa ficaria errada após rolar/redimensionar: fecha.
    window.addEventListener("scroll", fechar, true);
    window.addEventListener("resize", fechar);
    return () => {
      document.removeEventListener("mousedown", aoClicarFora);
      document.removeEventListener("keydown", aoTeclar);
      window.removeEventListener("scroll", fechar, true);
      window.removeEventListener("resize", fechar);
    };
  }, [aberto]);

  return (
    // stopPropagation: menus dentro de linhas clicáveis não disparam a navegação da linha.
    <div className={styles.menuSuspenso} ref={raiz} onClick={(e) => e.stopPropagation()}>
      <button
        ref={botao}
        type="button"
        className={classeBotao ?? styles.botao}
        aria-haspopup="true"
        aria-expanded={aberto}
        aria-controls={id}
        aria-label={ariaLabel}
        onClick={() => (aberto ? fechar() : abrir())}
      >
        {rotulo}
      </button>
      {aberto && (
        <div id={id} className={styles.painel} style={posicao}>
          {children(fechar)}
        </div>
      )}
    </div>
  );
}

export function DropdownItem({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className={styles.item} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}
