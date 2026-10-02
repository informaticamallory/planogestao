import type { AriaAttributes, ReactNode } from "react";

import styles from "./Card.module.css";

interface CardProps extends Pick<AriaAttributes, "aria-label" | "aria-labelledby" | "aria-busy"> {
  /** Sem título, o Card é só a moldura (sem cabeçalho). */
  titulo?: string;
  /** Nível do título (padrão h2). */
  nivel?: 2 | 3;
  /** id do título, para `aria-labelledby` de fora. */
  idTitulo?: string;
  /** Elemento da moldura (padrão section). Use "nav"/"article"/"div" quando a semântica pedir. */
  como?: "section" | "nav" | "article" | "div";
  /** Conteúdo à direita do título (links, alternâncias). */
  acoes?: ReactNode;
  carregando?: boolean;
  erro?: unknown;
  vazio?: boolean;
  mensagemVazio?: string;
  /** Mostra um indicador discreto enquanto dados novos chegam sobre os antigos. */
  atualizando?: boolean;
  /** Sem padding interno (ex.: tabela ou lista encostada nas bordas). */
  semPadding?: boolean;
  className?: string;
  children?: ReactNode;
}

/** Ponto de substituição do card/painel do UIKit: moldura + título + estados de carregamento/erro/vazio. */
export function Card({
  titulo,
  nivel = 2,
  idTitulo,
  como: Elemento = "section",
  acoes,
  carregando,
  erro,
  vazio,
  mensagemVazio = "Nenhum dado no período selecionado.",
  atualizando,
  semPadding,
  className,
  children,
  ...aria
}: CardProps) {
  let corpo = children;
  if (carregando) corpo = <p className={styles.estado}>Carregando…</p>;
  else if (erro) corpo = <p className={`${styles.estado} ${styles.estadoErro}`}>Não foi possível carregar.</p>;
  else if (vazio) corpo = <p className={styles.estado}>{mensagemVazio}</p>;
  const Titulo = nivel === 3 ? "h3" : "h2";

  return (
    <Elemento
      className={[styles.card, semPadding && styles.semPadding, className].filter(Boolean).join(" ")}
      aria-busy={aria["aria-busy"] ?? (carregando || atualizando || undefined)}
      aria-label={aria["aria-label"]}
      aria-labelledby={aria["aria-labelledby"]}
    >
      {(titulo || acoes) && (
        <header className={styles.cabecalho}>
          {titulo && (
            <Titulo id={idTitulo} className={styles.titulo}>
              {titulo}
            </Titulo>
          )}
          {atualizando && <span className={styles.atualizando}>Atualizando…</span>}
          {acoes && <div className={styles.acoes}>{acoes}</div>}
        </header>
      )}
      <div className={styles.corpo}>{corpo}</div>
    </Elemento>
  );
}
