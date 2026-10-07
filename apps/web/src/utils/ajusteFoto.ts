/**
 * Enquadramento da foto de perfil (mesmo modelo do backend, app/core/foto.py).
 *
 * A imagem guardada é a foto inteira; o recorte é só visual. A API devolve `avatar_url` com o ajuste no
 * fragmento (`…/abc.webp#f=c&m=p&x=0.5000&y=0.3000&z=1.400`), então qualquer avatar aplica o mesmo enquadramento.
 *
 * Desenho (estiloFoto): object-fit cover + object-position x% y% + scale(zoom) com origem no mesmo ponto. O ponto
 * (x, y) da foto fica sempre no ponto (x, y) da moldura, em qualquer tamanho: a prévia do editor e os avatares
 * pequenos mostram exatamente o mesmo recorte. "inteira": object-fit contain, foto toda, fundo neutro.
 */
import type { AjusteFoto } from "@planogestao/shared-types";
import type { CSSProperties } from "react";

export type { AjusteFoto };

export const ZOOM_MAX = 3;
export const AJUSTE_PADRAO: AjusteFoto = { formato: "quadrado", encaixe: "preencher", x: 0.5, y: 0.5, zoom: 1 };

const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Separa o endereço da imagem e o ajuste do fragmento (sem fragmento: null = padrão). */
export function lerUrlFoto(url: string): { src: string; ajuste: AjusteFoto | null } {
  const [src = url, frag] = url.split("#", 2);
  if (!frag) return { src, ajuste: null };
  const p = new URLSearchParams(frag);
  const num = (k: string, padrao: number) => {
    const v = Number(p.get(k));
    return Number.isFinite(v) && p.has(k) ? v : padrao;
  };
  return {
    src,
    ajuste: {
      formato: p.get("f") === "c" ? "circular" : "quadrado",
      encaixe: p.get("m") === "i" ? "inteira" : "preencher",
      x: limitar(num("x", 0.5), 0, 1),
      y: limitar(num("y", 0.5), 0, 1),
      zoom: limitar(num("z", 1), 1, ZOOM_MAX),
    },
  };
}

/** Estilo da <img> dentro de uma moldura com overflow: hidden (posição absoluta, ocupando a moldura). */
export function estiloFoto(a: AjusteFoto): CSSProperties {
  if (a.encaixe === "inteira") return { objectFit: "contain", objectPosition: "50% 50%" };
  const ponto = `${(a.x * 100).toFixed(2)}% ${(a.y * 100).toFixed(2)}%`;
  return { objectFit: "cover", objectPosition: ponto, transform: `scale(${a.zoom})`, transformOrigin: ponto };
}

/**
 * Arrastar: converte o deslocamento do ponteiro (px na moldura) em nova posição x/y. A foto acompanha o dedo;
 * nos eixos em que ela não sobra além da moldura, a posição não muda (não há o que mostrar).
 */
export function arrastar(a: AjusteFoto, dx: number, dy: number, moldura: number, proporcao: number): AjusteFoto {
  // Tamanho da foto (em molduras) no "cobrir" com zoom: o lado menor ocupa a moldura inteira.
  const largura = (proporcao >= 1 ? proporcao : 1) * a.zoom;
  const altura = (proporcao >= 1 ? 1 : 1 / proporcao) * a.zoom;
  const sobraX = (largura - 1) * moldura;
  const sobraY = (altura - 1) * moldura;
  return {
    ...a,
    x: sobraX > 0.5 ? limitar(a.x - dx / sobraX, 0, 1) : a.x,
    y: sobraY > 0.5 ? limitar(a.y - dy / sobraY, 0, 1) : a.y,
  };
}

export const comZoom = (a: AjusteFoto, zoom: number): AjusteFoto => ({ ...a, encaixe: "preencher", zoom: limitar(zoom, 1, ZOOM_MAX) });
