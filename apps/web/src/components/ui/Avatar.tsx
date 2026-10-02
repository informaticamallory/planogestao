import { resolverUrlApi } from "../../utils/urlApi";
import styles from "./Avatar.module.css";

export type AvatarTamanho = "sm" | "md" | "lg" | "xl";

interface AvatarProps {
  nome: string;
  /** Foto; sem ela, mostra as iniciais. */
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

/** Ponto de substituição do avatar do UIKit (Mallory DS: quadrado arredondado, iniciais em Sora). Decorativo. */
export function Avatar({ nome, url, tamanho = "md", className }: AvatarProps) {
  const classe = [styles.avatar, styles[tamanho], className].filter(Boolean).join(" ");
  if (url) return <img className={classe} src={resolverUrlApi(url)} alt="" />;
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
