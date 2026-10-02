import type { ReactNode } from "react";

import { Checkbox, Input } from "../ui/Input";
import { Select } from "../ui/Select";
import styles from "./Relatorios.module.css";

export function CampoSelect({
  rotulo,
  valor,
  onAlterar,
  opcoes,
  vazio,
}: {
  rotulo: string;
  valor: string | number | undefined;
  onAlterar: (v: string) => void;
  opcoes: { valor: string | number; rotulo: string }[];
  vazio: string;
}) {
  return (
    <label className={styles.campo}>
      <span className={styles.rotulo}>{rotulo}</span>
      <Select compacto className={styles.controleFiltro} value={valor ?? ""} onChange={(e) => onAlterar(e.target.value)}>
        <option value="">{vazio}</option>
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </Select>
    </label>
  );
}

export function CampoData({ rotulo, valor, onAlterar, min, max }: { rotulo: string; valor: string | undefined; onAlterar: (v: string) => void; min?: string; max?: string }) {
  return (
    <label className={styles.campo}>
      <span className={styles.rotulo}>{rotulo}</span>
      <Input compacto className={styles.controleFiltro} type="date" value={valor ?? ""} min={min} max={max} onChange={(e) => onAlterar(e.target.value)} />
    </label>
  );
}

/** Grupo de caixas de seleção (filtro de múltiplos valores, combinados com OU). */
export function GrupoOpcoes({
  rotulo,
  valores,
  onAlterar,
  opcoes,
}: {
  rotulo: string;
  valores: string[];
  onAlterar: (v: string[]) => void;
  opcoes: { valor: string; rotulo: ReactNode }[];
}) {
  const alternar = (v: string) => onAlterar(valores.includes(v) ? valores.filter((x) => x !== v) : [...valores, v]);
  return (
    <fieldset className={styles.grupo}>
      <legend className={styles.rotulo}>{rotulo}</legend>
      {opcoes.map((o) => (
        <Checkbox key={o.valor} rotulo={o.rotulo} checked={valores.includes(o.valor)} onChange={() => alternar(o.valor)} />
      ))}
    </fieldset>
  );
}

/** Remove o período personalizado incompleto (o backend recusaria sem as duas datas). */
export function comPeriodoValido<T>(f: Record<string, unknown>): T {
  const { periodo, data_inicio, data_fim, ...resto } = f;
  const consulta: Record<string, unknown> = { ...resto };
  if (periodo && (periodo !== "personalizado" || (data_inicio && data_fim))) {
    consulta.periodo = periodo;
    if (periodo === "personalizado") Object.assign(consulta, { data_inicio, data_fim });
  }
  return consulta as T;
}

export const idOuUndefined = (v: string) => (v ? Number(v) : undefined);
export const lista = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
