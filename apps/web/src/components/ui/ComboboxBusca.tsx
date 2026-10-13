import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { Input } from "./Input";
import styles from "./UserPicker.module.css";

interface Props<T extends { id: number }> {
  id?: string;
  ariaLabel: string;
  /** Lista completa (a busca é local: ignora maiúsculas e acentos). */
  opcoes: T[];
  valor: T | null;
  onSelecionar: (item: T | null) => void;
  /** Texto exibido e usado na busca (ex.: o nome). */
  texto: (item: T) => string;
  /** Informação extra na opção (ex.: o e-mail), também considerada na busca quando for texto. */
  detalhe?: (item: T) => string | null | undefined;
  placeholder?: string;
  mensagemVazia?: string;
  invalido?: boolean;
  idErro?: string;
  disabled?: boolean;
  /** Conteúdo à direita da opção (substitui `detalhe` na exibição). */
  extra?: (item: T) => ReactNode;
}

const normalizar = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR").trim();

/** Combobox com busca numa lista já carregada (mesma aparência e teclado do UserPicker). */
export function ComboboxBusca<T extends { id: number }>({
  id, ariaLabel, opcoes, valor, onSelecionar, texto, detalhe, placeholder = "Buscar pelo nome", mensagemVazia = "Nada encontrado.",
  invalido, idErro, disabled, extra,
}: Props<T>) {
  const [busca, setBusca] = useState(valor ? texto(valor) : "");
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const raiz = useRef<HTMLDivElement>(null);
  const idLista = useId();

  // Só quando a seleção muda (`texto` costuma ser uma função nova a cada render e apagaria o que se digita).
  useEffect(() => setBusca(valor ? texto(valor) : ""), [valor?.id]);

  const termo = valor && busca === texto(valor) ? "" : normalizar(busca);
  const filtradas = termo
    ? opcoes.filter((o) => normalizar(`${texto(o)} ${detalhe?.(o) ?? ""}`).includes(termo))
    : opcoes;

  useEffect(() => setAtivo(0), [termo]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) {
        setAberto(false);
        setBusca(valor ? texto(valor) : ""); // descarta texto digitado sem seleção
      }
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto, valor, texto]);

  const escolher = (item: T) => {
    onSelecionar(item);
    setBusca(texto(item));
    setAberto(false);
  };

  return (
    <div className={styles.campoUsuario} ref={raiz}>
      <Input
        id={id}
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={aberto}
        aria-controls={idLista}
        aria-autocomplete="list"
        aria-activedescendant={aberto && filtradas[ativo] ? `${idLista}-${filtradas[ativo].id}` : undefined}
        aria-invalid={invalido || undefined}
        aria-describedby={idErro}
        placeholder={placeholder}
        value={busca}
        disabled={disabled}
        autoComplete="off"
        onFocus={() => setAberto(true)}
        onChange={(e) => {
          setBusca(e.target.value);
          setAberto(true);
          if (!e.target.value) onSelecionar(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setAberto(true);
            setAtivo((i) => Math.min(i + 1, filtradas.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setAtivo((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && aberto && filtradas[ativo]) {
            e.preventDefault();
            escolher(filtradas[ativo]);
          } else if (e.key === "Escape" && aberto) {
            e.stopPropagation();
            setAberto(false);
            setBusca(valor ? texto(valor) : "");
          }
        }}
      />
      {aberto && !disabled && (
        <ul id={idLista} role="listbox" aria-label={ariaLabel} className={styles.lista}>
          {filtradas.length === 0 && <li className={styles.vazio}>{mensagemVazia}</li>}
          {filtradas.map((o, i) => (
            <li
              key={o.id}
              id={`${idLista}-${o.id}`}
              role="option"
              aria-selected={valor?.id === o.id}
              className={i === ativo ? `${styles.opcao} ${styles.opcaoAtiva}` : styles.opcao}
              onMouseEnter={() => setAtivo(i)}
              // mousedown para selecionar antes de o input perder o foco
              onMouseDown={(e) => {
                e.preventDefault();
                escolher(o);
              }}
            >
              <span>{texto(o)}</span>
              {extra ? extra(o) : detalhe?.(o) && <span className={styles.area}>{detalhe(o)}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
