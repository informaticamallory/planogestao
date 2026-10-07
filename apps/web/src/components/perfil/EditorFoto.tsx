import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { AJUSTE_PADRAO, ZOOM_MAX, arrastar, comZoom, type AjusteFoto } from "../../utils/ajusteFoto";
import admin from "../admin/Admin.module.css";
import { FotoEnquadrada } from "../ui/Avatar";
import avatar from "../ui/Avatar.module.css";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Modal } from "../ui/Modal";
import estilos from "./EditorFoto.module.css";

interface EditorFotoProps {
  aberto: boolean;
  /** Imagem inteira (arquivo escolhido ou a original guardada). */
  src: string | null;
  ajusteInicial: AjusteFoto;
  salvando: boolean;
  erro?: string;
  onCancelar: () => void;
  onSalvar: (ajuste: AjusteFoto) => void;
}

const PASSO_TECLADO = 0.04; // fração da moldura por toque de seta
const fmtZoom = (z: number) => `${z.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}×`;

/**
 * Editor de enquadramento: formato, posição (arrastar com mouse/dedo ou setas), zoom (controle, pinça, roda ou
 * +/−), "Encaixar foto inteira" e "Restaurar ajuste". A prévia usa a mesma peça dos avatares (FotoEnquadrada):
 * o que aparece aqui é o resultado final, em qualquer tamanho. Não altera a imagem (sem recorte nem filtro).
 */
export function EditorFoto({ aberto, src, ajusteInicial, salvando, erro, onCancelar, onSalvar }: EditorFotoProps) {
  const [ajuste, setAjuste] = useState<AjusteFoto>(ajusteInicial);
  const [proporcao, setProporcao] = useState<number | null>(null);
  const [falhou, setFalhou] = useState(false);
  const palco = useRef<HTMLDivElement>(null);
  const imagem = useRef<HTMLImageElement>(null);
  const ponteiros = useRef(new Map<number, { x: number; y: number }>());
  const pinca = useRef<{ distancia: number; zoom: number } | null>(null);

  // Cada abertura (foto nova ou "Ajustar foto") começa do ajuste recebido.
  useEffect(() => {
    if (aberto) setAjuste(ajusteInicial);
  }, [aberto, src, ajusteInicial]);

  // Proporção da imagem: do onLoad, ou da própria <img> se ela já tinha carregado (cache) antes deste efeito.
  useEffect(() => {
    const img = imagem.current;
    setFalhou(false);
    setProporcao(img?.complete && img.naturalWidth ? img.naturalWidth / img.naturalHeight : null);
  }, [aberto, src]);

  // Roda do mouse: zoom (listener nativo para poder impedir a rolagem da página).
  useEffect(() => {
    const el = palco.current;
    if (!el || !aberto) return;
    const aoRolar = (e: WheelEvent) => {
      e.preventDefault();
      setAjuste((a) => comZoom(a, a.zoom * Math.exp(-e.deltaY * 0.0015)));
    };
    el.addEventListener("wheel", aoRolar, { passive: false });
    return () => el.removeEventListener("wheel", aoRolar);
  }, [aberto, proporcao]);

  const lado = () => palco.current?.getBoundingClientRect().width ?? 1;
  const mover = (dx: number, dy: number) =>
    // Arrastar a "foto inteira" passa para o modo preencher (a foto cobre a moldura e pode ser posicionada).
    setAjuste((a) => (proporcao ? arrastar({ ...a, encaixe: "preencher" }, dx, dy, lado(), proporcao) : a));

  const aoPressionar = (e: PointerEvent<HTMLDivElement>) => {
    try {
      // Continua recebendo o movimento mesmo se o dedo sair da moldura.
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ponteiro já liberado (ex.: toque muito curto): o arraste segue pelos eventos normais.
    }
    ponteiros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ponteiros.current.size === 2) {
      const [p1, p2] = [...ponteiros.current.values()];
      pinca.current = { distancia: Math.hypot(p1!.x - p2!.x, p1!.y - p2!.y) || 1, zoom: ajuste.zoom };
    }
  };

  const aoMover = (e: PointerEvent<HTMLDivElement>) => {
    const anterior = ponteiros.current.get(e.pointerId);
    if (!anterior) return;
    ponteiros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ponteiros.current.size === 2 && pinca.current) {
      // Pinça (dois dedos): zoom proporcional à abertura.
      const [p1, p2] = [...ponteiros.current.values()];
      const d = Math.hypot(p1!.x - p2!.x, p1!.y - p2!.y);
      const inicio = pinca.current;
      setAjuste((a) => comZoom(a, (inicio.zoom * d) / inicio.distancia));
      return;
    }
    mover(e.clientX - anterior.x, e.clientY - anterior.y);
  };

  const aoSoltar = (e: PointerEvent<HTMLDivElement>) => {
    ponteiros.current.delete(e.pointerId);
    if (ponteiros.current.size < 2) pinca.current = null;
  };

  const aoTeclar = (e: KeyboardEvent<HTMLDivElement>) => {
    const passo = lado() * PASSO_TECLADO;
    const teclas: Record<string, () => void> = {
      // A foto anda no sentido da seta.
      ArrowLeft: () => mover(-passo, 0),
      ArrowRight: () => mover(passo, 0),
      ArrowUp: () => mover(0, -passo),
      ArrowDown: () => mover(0, passo),
      "+": () => setAjuste((a) => comZoom(a, a.zoom + 0.1)),
      "=": () => setAjuste((a) => comZoom(a, a.zoom + 0.1)),
      "-": () => setAjuste((a) => comZoom(a, a.zoom - 0.1)),
    };
    const acao = teclas[e.key];
    if (acao) {
      e.preventDefault();
      acao();
    }
  };

  const inteira = ajuste.encaixe === "inteira";

  return (
    <Modal
      aberto={aberto}
      titulo="Ajustar foto"
      largura="larga"
      onFechar={onCancelar}
      acoes={
        <>
          <Button onClick={onCancelar} disabled={salvando}>
            Cancelar
          </Button>
          <Button variante="primaria" disabled={salvando || !proporcao} onClick={() => onSalvar(ajuste)}>
            {salvando ? "Salvando…" : "Salvar"}
          </Button>
        </>
      }
    >
      <div className={estilos.editor}>
        <div className={estilos.coluna}>
          <div
            ref={palco}
            className={estilos.palco}
            data-arrastavel={proporcao ? true : undefined}
            tabIndex={0}
            role="group"
            aria-label="Enquadramento da foto. Arraste para mover; setas movem, + e − ajustam o zoom."
            onPointerDown={aoPressionar}
            onPointerMove={aoMover}
            onPointerUp={aoSoltar}
            onPointerCancel={aoSoltar}
            onKeyDown={aoTeclar}
          >
            {src && !falhou ? (
              <FotoEnquadrada
                src={src}
                ajuste={ajuste}
                className={estilos.molduraGrande}
                imgRef={imagem}
                onLoad={(e) => setProporcao(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight || 1)}
                onError={() => setFalhou(true)}
              />
            ) : (
              <span className={`${estilos.molduraGrande} ${estilos.vazio}`}>{falhou ? "Não foi possível abrir a foto." : ""}</span>
            )}
          </div>
          <p className={admin.meta}>
            {proporcao
              ? inteira
                ? "Foto inteira, sem cortes (fundo neutro nas sobras). Arraste ou use o zoom para enquadrar."
                : "Arraste para posicionar o rosto. Zoom: controle abaixo, pinça com dois dedos ou roda do mouse."
              : falhou
                ? ""
                : "Carregando a foto…"}
          </p>
        </div>

        <div className={estilos.coluna}>
          <fieldset className={estilos.grupo}>
            <legend>Formato</legend>
            <div className={estilos.formatos}>
              {(
                [
                  ["circular", "Circular"],
                  ["quadrado", "Quadrado com cantos arredondados"],
                ] as const
              ).map(([id, rotulo]) => (
                <label key={id} className={estilos.formato} data-ativa={ajuste.formato === id || undefined}>
                  <input type="radio" name="formato-foto" checked={ajuste.formato === id} onChange={() => setAjuste((a) => ({ ...a, formato: id }))} />
                  <span className={estilos.iconeFormato} data-formato={id} aria-hidden="true" />
                  {rotulo}
                </label>
              ))}
            </div>
          </fieldset>

          <div className={estilos.grupo}>
            <label htmlFor="zoom-foto" className={estilos.rotulo}>
              Zoom <span className={admin.meta}>{inteira ? "foto inteira" : fmtZoom(ajuste.zoom)}</span>
            </label>
            <div className={estilos.zoom}>
              <Button variante="icone" tamanho="sm" aria-label="Afastar" onClick={() => setAjuste((a) => comZoom(a, a.zoom - 0.1))}>
                <Icon name="minus" size={16} />
              </Button>
              <input
                id="zoom-foto"
                type="range"
                min={1}
                max={ZOOM_MAX}
                step={0.01}
                value={inteira ? 1 : ajuste.zoom}
                aria-valuetext={inteira ? "foto inteira" : fmtZoom(ajuste.zoom)}
                onChange={(e) => setAjuste((a) => comZoom(a, Number(e.target.value)))}
              />
              <Button variante="icone" tamanho="sm" aria-label="Aproximar" onClick={() => setAjuste((a) => comZoom(a, a.zoom + 0.1))}>
                <Icon name="plus" size={16} />
              </Button>
            </div>
          </div>

          <div className={estilos.botoes}>
            <Button aria-pressed={inteira} onClick={() => setAjuste((a) => ({ ...a, encaixe: "inteira" }))}>
              Encaixar foto inteira
            </Button>
            {/* Volta ao enquadramento padrão (centralizado, sem zoom), mantendo o formato escolhido. */}
            <Button variante="link" onClick={() => setAjuste((a) => ({ ...AJUSTE_PADRAO, formato: a.formato }))}>
              Restaurar ajuste
            </Button>
          </div>

          {src && proporcao && (
            <div className={estilos.grupo}>
              <span className={estilos.rotulo}>Como vai aparecer</span>
              <div className={estilos.amostras}>
                <span className={estilos.amostra}>
                  <FotoEnquadrada src={src} ajuste={ajuste} className={`${avatar.avatar} ${avatar.xl}`} />
                  Perfil
                </span>
                <span className={estilos.amostra}>
                  <FotoEnquadrada src={src} ajuste={ajuste} className={`${avatar.avatar} ${avatar.md}`} />
                  Listas
                </span>
                <span className={estilos.amostra}>
                  <FotoEnquadrada src={src} ajuste={ajuste} className={`${avatar.avatar} ${avatar.sm}`} />
                  Menu
                </span>
              </div>
            </div>
          )}
          {erro && (
            <p className={admin.erro} role="alert">
              {erro}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
