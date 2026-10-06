import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { Input } from "../ui/Input";
import styles from "../ui/UserPicker.module.css";

interface BuscaSelecaoProps<T> {
  id: string;
  ariaLabel: string;
  placeholder: string;
  /** Prefixo da chave do React Query (o termo é acrescentado). */
  chave: readonly unknown[];
  buscar: (termo: string) => Promise<T[]>;
  idDe: (item: T) => number;
  textoDe: (item: T) => string;
  detalheDe?: (item: T) => ReactNode;
  /** Seleção única: o texto do campo mostra o item. Sem `valor` (seleção múltipla), o campo limpa ao escolher. */
  valor?: T | null;
  onSelecionar: (item: T) => void;
  onLimpar?: () => void;
  /** Ids já escolhidos: não aparecem na lista. */
  ocultar?: ReadonlySet<number>;
  desabilitado?: boolean;
  invalido?: boolean;
  idErro?: string;
  vazio?: string;
}

/** Combobox com busca na API (debounce de 250 ms), no padrão do UserPicker. */
export function BuscaSelecao<T>({
  id,
  ariaLabel,
  placeholder,
  chave,
  buscar,
  idDe,
  textoDe,
  detalheDe,
  valor,
  onSelecionar,
  onLimpar,
  ocultar,
  desabilitado,
  invalido,
  idErro,
  vazio = "Nada encontrado.",
}: BuscaSelecaoProps<T>) {
  const unico = valor !== undefined;
  const textoValor = valor ? textoDe(valor) : "";
  const [texto, setTexto] = useState(textoValor);
  const [termo, setTermo] = useState("");
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const raiz = useRef<HTMLDivElement>(null);
  const idLista = useId();

  useEffect(() => setTexto(textoValor), [textoValor]);

  useEffect(() => {
    const t = setTimeout(() => setTermo(unico && texto === textoValor ? "" : texto.trim()), 250);
    return () => clearTimeout(t);
  }, [texto, textoValor, unico]);

  const { data = [], isFetching, error } = useQuery({
    queryKey: [...chave, termo],
    queryFn: () => buscar(termo),
    enabled: aberto && !desabilitado,
    staleTime: 30_000,
  });
  const opcoes = ocultar ? data.filter((o) => !ocultar.has(idDe(o))) : data;

  useEffect(() => setAtivo(0), [data]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) {
        setAberto(false);
        setTexto(textoValor); // descarta texto digitado sem seleção
      }
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto, textoValor]);

  const escolher = (item: T) => {
    onSelecionar(item);
    if (unico) {
      setTexto(textoDe(item));
      setAberto(false);
    } else {
      setTexto(""); // múltipla: continua aberta para o próximo
    }
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
        aria-activedescendant={aberto && opcoes[ativo] ? `${idLista}-${idDe(opcoes[ativo])}` : undefined}
        aria-invalid={invalido || undefined}
        aria-describedby={idErro}
        autoComplete="off"
        placeholder={placeholder}
        disabled={desabilitado}
        value={texto}
        onFocus={() => setAberto(true)}
        onChange={(e) => {
          setTexto(e.target.value);
          setAberto(true);
          if (unico && !e.target.value) onLimpar?.();
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setAberto(true);
            setAtivo((i) => Math.min(i + 1, opcoes.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setAtivo((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && aberto && opcoes[ativo]) {
            e.preventDefault();
            escolher(opcoes[ativo]);
          } else if (e.key === "Escape") {
            setAberto(false);
            setTexto(textoValor);
          }
        }}
      />
      {aberto && !desabilitado && (
        <ul id={idLista} role="listbox" aria-label={ariaLabel} className={styles.lista}>
          {opcoes.length === 0 && (
            <li className={styles.vazio}>{error ? (error as Error).message : isFetching ? "Buscando…" : vazio}</li>
          )}
          {opcoes.map((o, i) => (
            <li
              key={idDe(o)}
              id={`${idLista}-${idDe(o)}`}
              role="option"
              aria-selected={valor ? idDe(valor) === idDe(o) : false}
              className={i === ativo ? `${styles.opcao} ${styles.opcaoAtiva}` : styles.opcao}
              onMouseEnter={() => setAtivo(i)}
              // mousedown para selecionar antes de o input perder o foco
              onMouseDown={(e) => {
                e.preventDefault();
                escolher(o);
              }}
            >
              <span>{textoDe(o)}</span>
              {detalheDe && <span className={styles.area}>{detalheDe(o)}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
