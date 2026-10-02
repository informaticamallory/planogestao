import { useEffect, useState } from "react";

import { Input } from "../ui/Input";
import styles from "./BarraFerramentas.module.css";

const ATRASO_MS = 350;

/** Campo de busca com debounce: a URL (e a consulta) só muda quando o usuário para de digitar. */
export function BuscaPlanos({ valor, onBuscar }: { valor: string; onBuscar: (termo: string) => void }) {
  const [texto, setTexto] = useState(valor);

  // Sincroniza quando a URL muda por fora (voltar do navegador, "limpar filtros").
  useEffect(() => setTexto(valor), [valor]);

  useEffect(() => {
    if (texto === valor) return;
    const t = setTimeout(() => onBuscar(texto), ATRASO_MS);
    return () => clearTimeout(t);
  }, [texto, valor, onBuscar]);

  return (
    <Input
      type="search"
      className={styles.busca}
      placeholder="Buscar por nome ou código"
      aria-label="Buscar planos por nome ou código"
      value={texto}
      maxLength={100}
      onChange={(e) => setTexto(e.target.value)}
    />
  );
}
