import type { UsuarioOpcao } from "@planogestao/shared-types";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";

import { api } from "../../services/api";
import { Input } from "./Input";
import styles from "./UserPicker.module.css";

interface UserPickerProps {
  id?: string;
  valor: UsuarioOpcao | null;
  onSelecionar: (usuario: UsuarioOpcao | null) => void;
  invalido?: boolean;
  idErro?: string;
  ariaLabel: string;
}

/** Combobox com busca de usuários na API (debounce de 250 ms). */
export function UserPicker({ id, valor, onSelecionar, invalido, idErro, ariaLabel }: UserPickerProps) {
  const [texto, setTexto] = useState(valor?.nome ?? "");
  const [termo, setTermo] = useState("");
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const raiz = useRef<HTMLDivElement>(null);
  const idLista = useId();

  useEffect(() => setTexto(valor?.nome ?? ""), [valor]);

  useEffect(() => {
    const t = setTimeout(() => setTermo(texto === valor?.nome ? "" : texto.trim()), 250);
    return () => clearTimeout(t);
  }, [texto, valor]);

  const { data: opcoes = [], isFetching } = useQuery({
    queryKey: ["usuarios", "opcoes", termo],
    queryFn: () => api.usuarios.buscar(termo),
    enabled: aberto,
    staleTime: 60_000,
  });

  useEffect(() => setAtivo(0), [opcoes]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) {
        setAberto(false);
        setTexto(valor?.nome ?? ""); // descarta texto digitado sem seleção
      }
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto, valor]);

  const escolher = (u: UsuarioOpcao) => {
    onSelecionar(u);
    setTexto(u.nome);
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
        aria-activedescendant={aberto && opcoes[ativo] ? `${idLista}-${opcoes[ativo].id}` : undefined}
        aria-invalid={invalido || undefined}
        aria-describedby={idErro}
        placeholder="Buscar por nome ou e-mail"
        value={texto}
        onFocus={() => setAberto(true)}
        onChange={(e) => {
          setTexto(e.target.value);
          setAberto(true);
          if (!e.target.value) onSelecionar(null);
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
            setTexto(valor?.nome ?? "");
          }
        }}
      />
      {aberto && (
        <ul id={idLista} role="listbox" className={styles.lista}>
          {opcoes.length === 0 && (
            <li className={styles.vazio}>{isFetching ? "Buscando…" : "Nenhum usuário encontrado."}</li>
          )}
          {opcoes.map((u, i) => (
            <li
              key={u.id}
              id={`${idLista}-${u.id}`}
              role="option"
              aria-selected={valor?.id === u.id}
              className={i === ativo ? `${styles.opcao} ${styles.opcaoAtiva}` : styles.opcao}
              onMouseEnter={() => setAtivo(i)}
              // mousedown para selecionar antes de o input perder o foco
              onMouseDown={(e) => {
                e.preventDefault();
                escolher(u);
              }}
            >
              <span>{u.nome}</span>
              {u.area && <span className={styles.area}>{u.area}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
