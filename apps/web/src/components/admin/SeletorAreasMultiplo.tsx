import { useEffect, useId, useRef, useState } from "react";

import { Icon } from "../ui/Icon";
import controles from "../ui/Input.module.css";
import base from "./AreasAutorizadas.module.css";
import styles from "./SeletorAreasMultiplo.module.css";

export interface OpcaoAreaSelecao {
  id: number;
  nome: string;
  /** Motivo para não poder marcar (ex.: "já vinculada"); a área aparece desabilitada com o motivo. */
  bloqueio?: string;
}

interface Props {
  id: string;
  rotulo: string;
  opcoes: OpcaoAreaSelecao[];
  selecionadas: number[];
  onChange: (ids: number[]) => void;
  /** Edição de um vínculo: uma área só (marcar outra troca a escolhida) e sem "Selecionar todas". */
  unica?: boolean;
  disabled?: boolean;
  /** Texto do campo desabilitado (ex.: "Selecione o gestor primeiro"). */
  textoDesabilitado?: string;
  invalido?: boolean;
  idErro?: string;
}

const normalizar = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR").trim();

/** "Selecione…" | nome da área | "N áreas selecionadas". */
export function resumoSelecao(ids: number[], opcoes: OpcaoAreaSelecao[]): string {
  if (ids.length === 0) return "Selecione…";
  if (ids.length === 1) return opcoes.find((a) => a.id === ids[0])?.nome ?? "1 área selecionada";
  return `${ids.length} áreas selecionadas`;
}

/**
 * Seleção múltipla de áreas com busca, caixas de seleção e "Selecionar todas as áreas disponíveis" (as que
 * existem agora; nada de futuras). As escolhidas aparecem abaixo como tags removíveis. Mesma aparência do
 * seletor de áreas autorizadas (Usuários).
 */
export function SeletorAreasMultiplo({
  id, rotulo, opcoes, selecionadas, onChange, unica, disabled, textoDesabilitado, invalido, idErro,
}: Props) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const raiz = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const idLista = useId();

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => !raiz.current?.contains(e.target as Node) && setAberto(false);
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  useEffect(() => {
    if (disabled) setAberto(false);
  }, [disabled]);

  const marcadas = new Set(selecionadas);
  const termo = normalizar(busca);
  const filtradas = termo ? opcoes.filter((a) => normalizar(a.nome).includes(termo)) : opcoes;
  const disponiveis = opcoes.filter((a) => !a.bloqueio);
  const todasMarcadas = disponiveis.length > 0 && disponiveis.every((a) => marcadas.has(a.id));
  const nome = (areaId: number) => opcoes.find((a) => a.id === areaId)?.nome ?? `Área ${areaId}`;

  const alternar = (areaId: number) => {
    if (unica) return onChange(marcadas.has(areaId) ? [] : [areaId]);
    onChange(marcadas.has(areaId) ? selecionadas.filter((x) => x !== areaId) : [...selecionadas, areaId]);
  };
  const fechar = () => {
    setAberto(false);
    botao.current?.focus();
  };

  return (
    <div className={styles.raiz}>
      <div
        ref={raiz}
        className={base.raiz}
        onKeyDown={(e) => {
          if (e.key === "Escape" && aberto) {
            e.stopPropagation();
            e.preventDefault();
            fechar();
          }
        }}
      >
        <button
          ref={botao}
          type="button"
          id={id}
          aria-haspopup="listbox"
          aria-expanded={aberto}
          aria-controls={aberto ? idLista : undefined}
          aria-invalid={invalido || undefined}
          aria-describedby={idErro}
          disabled={disabled}
          className={`${controles.controle} ${base.campo} ${selecionadas.length && !disabled ? "" : base.placeholder}`}
          title={selecionadas.length > 1 ? selecionadas.map(nome).join(", ") : undefined}
          onClick={() => setAberto((a) => !a)}
        >
          <span className={base.resumo}>{disabled ? textoDesabilitado ?? "Selecione…" : resumoSelecao(selecionadas, opcoes)}</span>
          <svg className={base.seta} viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {aberto && (
          <div className={base.painel}>
            <input
              type="search"
              className={base.busca}
              placeholder="Buscar área pelo nome…"
              aria-label="Buscar área pelo nome"
              value={busca}
              autoFocus
              onChange={(e) => setBusca(e.target.value)}
            />
            <ul id={idLista} role="listbox" aria-multiselectable={!unica} aria-label={rotulo} className={base.lista}>
              {!unica && disponiveis.length > 0 && (
                <li role="option" aria-selected={todasMarcadas} className={base.todas}>
                  <label>
                    <input
                      type="checkbox"
                      checked={todasMarcadas}
                      // Marca as disponíveis AGORA (sem as bloqueadas); desmarcar limpa a seleção.
                      onChange={(e) => onChange(e.target.checked ? disponiveis.map((a) => a.id) : [])}
                    />
                    <span>
                      Selecionar todas as áreas disponíveis <span className={base.dica}>({disponiveis.length})</span>
                    </span>
                  </label>
                </li>
              )}
              {filtradas.map((a) => (
                <li key={a.id} role="option" aria-selected={marcadas.has(a.id)} aria-disabled={!!a.bloqueio || undefined}>
                  <label className={a.bloqueio ? base.desabilitado : undefined}>
                    <input
                      type={unica ? "radio" : "checkbox"}
                      name={unica ? `${id}-unica` : undefined}
                      checked={marcadas.has(a.id)}
                      disabled={!!a.bloqueio}
                      onChange={() => alternar(a.id)}
                    />
                    <span>
                      {a.nome}
                      {a.bloqueio && <span className={base.dica}> ({a.bloqueio})</span>}
                    </span>
                  </label>
                </li>
              ))}
              {!filtradas.length && <li className={base.semResultado}>{opcoes.length ? "Nenhuma área encontrada." : "Nenhuma área disponível."}</li>}
            </ul>
          </div>
        )}
      </div>

      {selecionadas.length > 0 && !disabled && (
        <ul className={styles.tags} aria-label={`${rotulo}: selecionadas`}>
          {selecionadas.map((areaId) => (
            <li key={areaId} className={styles.tag}>
              <span>{nome(areaId)}</span>
              <button
                type="button"
                className={styles.removerTag}
                onClick={() => onChange(selecionadas.filter((x) => x !== areaId))}
                aria-label={`Remover ${nome(areaId)}`}
              >
                <Icon name="x" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
