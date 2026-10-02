import type { TipoPeriodo } from "@planogestao/shared-types";

import { useFiltroPeriodo } from "../../hooks/useFiltroPeriodo";
import { ROTULO_PERIODO } from "../../utils/rotulos";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import styles from "./SeletorPeriodo.module.css";

const OPCOES = Object.entries(ROTULO_PERIODO) as [TipoPeriodo, string][];

export function SeletorPeriodo() {
  const { tipo, dataInicio, dataFim, alterar, personalizadoIncompleto } = useFiltroPeriodo();

  return (
    <div className={styles.seletorPeriodo}>
      <label className={styles.campo}>
        <span className={styles.rotulo}>Período</span>
        <Select
          compacto
          value={tipo}
          onChange={(e) => alterar({ periodo: e.target.value as TipoPeriodo, data_inicio: dataInicio, data_fim: dataFim })}
        >
          {OPCOES.map(([valor, rotulo]) => (
            <option key={valor} value={valor}>
              {rotulo}
            </option>
          ))}
        </Select>
      </label>

      {tipo === "personalizado" && (
        <>
          <label className={styles.campo}>
            <span className={styles.rotulo}>De</span>
            <Input
              compacto
              type="date"
              value={dataInicio}
              max={dataFim || undefined}
              onChange={(e) => alterar({ periodo: tipo, data_inicio: e.target.value, data_fim: dataFim })}
            />
          </label>
          <label className={styles.campo}>
            <span className={styles.rotulo}>Até</span>
            <Input
              compacto
              type="date"
              value={dataFim}
              min={dataInicio || undefined}
              onChange={(e) => alterar({ periodo: tipo, data_inicio: dataInicio, data_fim: e.target.value })}
            />
          </label>
          {personalizadoIncompleto && (
            <span className={styles.aviso}>Informe as duas datas. Enquanto isso, é exibido o mês atual.</span>
          )}
        </>
      )}
    </div>
  );
}
