import type { CSSProperties, Ref, SyntheticEvent } from "react";

import { AJUSTE_PADRAO, estiloFoto, lerUrlFoto, type AjusteFoto } from "../../utils/ajusteFoto";
import { resolverUrlApi } from "../../utils/urlApi";
import styles from "./Avatar.module.css";

export type AvatarTamanho = "sm" | "md" | "lg" | "xl";

interface AvatarProps {
  nome: string;
  /** Foto (com o enquadramento no fragmento, como a API devolve); sem ela, mostra as iniciais. */
  url?: string | null;
  tamanho?: AvatarTamanho;
  className?: string;
}

// Cores do kit para iniciais; cada pessoa fica sempre com a mesma (hash do nome).
const CORES = ["--primary", "--info", "--success", "--c5", "--c6", "--amber"];

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const primeira = partes[0]?.[0] ?? "";
  const ultima = partes.length > 1 ? partes[partes.length - 1]![0] : "";
  return (primeira + ultima).toUpperCase();
}

function corDoNome(nome: string): string {
  let h = 0;
  for (const ch of nome) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CORES[h % CORES.length]!;
}

interface FotoEnquadradaProps {
  src: string;
  ajuste: AjusteFoto;
  className?: string;
  style?: CSSProperties;
  imgRef?: Ref<HTMLImageElement>;
  onLoad?: (e: SyntheticEvent<HTMLImageElement>) => void;
  onError?: () => void;
  alt?: string;
}

/**
 * Foto dentro da moldura com o enquadramento aplicado. A MESMA peça desenha os avatares e a prévia do editor:
 * o tamanho vem da moldura (className), o recorte do ajuste — por isso a prévia é igual ao resultado.
 */
export function FotoEnquadrada({ src, ajuste, className, style, imgRef, onLoad, onError, alt = "" }: FotoEnquadradaProps) {
  const classe = [styles.moldura, ajuste.formato === "circular" && styles.circular, ajuste.encaixe === "inteira" && styles.inteira, className]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={classe} style={style}>
      <img ref={imgRef} className={styles.imagem} src={src} alt={alt} style={estiloFoto(ajuste)} onLoad={onLoad} onError={onError} draggable={false} />
    </span>
  );
}

/** Ponto de substituição do avatar do UIKit (Mallory DS: quadrado arredondado, iniciais em Sora). Decorativo. */
export function Avatar({ nome, url, tamanho = "md", className }: AvatarProps) {
  const classe = [styles.avatar, styles[tamanho], className].filter(Boolean).join(" ");
  if (url) {
    const { src, ajuste } = lerUrlFoto(url);
    return <FotoEnquadrada src={resolverUrlApi(src)} ajuste={ajuste ?? AJUSTE_PADRAO} className={classe} />;
  }
  const cor = `var(${corDoNome(nome)})`;
  return (
    <span
      className={classe}
      style={{ color: `color-mix(in oklab, ${cor} 80%, var(--fg))`, background: `color-mix(in oklab, ${cor} 16%, transparent)` }}
      aria-hidden="true"
    >
      {iniciais(nome)}
    </span>
  );
}
