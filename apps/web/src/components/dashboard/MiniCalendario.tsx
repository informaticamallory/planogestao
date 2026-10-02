import type { DiaCalendario } from "@planogestao/shared-types";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useCalendarioMes } from "../../hooks/useDashboard";
import { formatarData, formatarMesAnoLongo, paraIsoData } from "../../utils/datas";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import styles from "./MiniCalendario.module.css";

const DIAS_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

// Da mais crítica para a menos: a ordem dos pontos no dia e da legenda.
const SITUACOES = [
  { chave: "atrasadas", rotulo: "Em atraso", token: "--cor-prazo-em_atraso" },
  { chave: "vencendo", rotulo: "A vencer", token: "--cor-prazo-a_vencer" },
  { chave: "em_andamento", rotulo: "No prazo", token: "--cor-prazo-no_prazo" },
  { chave: "concluidas", rotulo: "Concluída", token: "--cor-dado-concluida" },
] as const;

function descreverDia(iso: string, dia: DiaCalendario | undefined): string {
  const data = formatarData(iso);
  if (!dia) return `${data}: sem ações`;
  const partes = SITUACOES.filter((s) => dia[s.chave] > 0).map((s) => `${dia[s.chave]} ${s.rotulo.toLowerCase()}`);
  return `${data}: ${partes.join(", ")}`;
}

/** Conteúdo do widget "Mini calendário" do painel (a moldura e o título vêm do widget). */
export function MiniCalendario() {
  const navigate = useNavigate();
  const hoje = new Date();
  const [mesVisivel, setMesVisivel] = useState(() => new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  const ano = mesVisivel.getFullYear();
  const mes = mesVisivel.getMonth() + 1;
  const { data, isLoading, isFetching, error } = useCalendarioMes(ano, mes);

  const porData = new Map((data?.dias ?? []).map((d) => [d.data, d]));
  const totalDias = new Date(ano, mes, 0).getDate();
  const deslocamento = mesVisivel.getDay();
  const hojeIso = paraIsoData(hoje);

  const mudarMes = (delta: number) => setMesVisivel(new Date(ano, mes - 1 + delta, 1));

  return (
    <div className={styles.miniCalendario} aria-busy={isLoading || isFetching || undefined}>
      <div className={styles.navegacao}>
        <Button variante="icone" tamanho="sm" onClick={() => mudarMes(-1)} aria-label="Mês anterior">
          <Icon name="chevronLeft" size={17} />
        </Button>
        <span className={styles.mesAtual}>{formatarMesAnoLongo(mesVisivel)}</span>
        <Button variante="icone" tamanho="sm" onClick={() => mudarMes(1)} aria-label="Próximo mês">
          <Icon name="chevronRight" size={17} />
        </Button>
      </div>
      {error ? <p className={styles.estado}>Não foi possível carregar.</p> : null}
      <div className={styles.grade} role="group" aria-label={`Ações por prazo em ${formatarMesAnoLongo(mesVisivel)}`}>
        {DIAS_SEMANA.map((d, i) => (
          <span key={i} className={styles.diaSemana} aria-hidden="true">
            {d}
          </span>
        ))}
        {Array.from({ length: deslocamento }, (_, i) => (
          <span key={`vazio-${i}`} />
        ))}
        {Array.from({ length: totalDias }, (_, i) => {
          const iso = paraIsoData(new Date(ano, mes - 1, i + 1));
          const dia = porData.get(iso);
          const classes = [styles.dia, iso === hojeIso && styles.diaHoje, dia && styles.diaComAcoes].filter(Boolean).join(" ");
          return (
            <button
              key={iso}
              type="button"
              className={classes}
              onClick={() => navigate(`/calendario?data=${iso}`)}
              aria-label={descreverDia(iso, dia)}
              title={dia ? descreverDia(iso, dia) : undefined}
            >
              <span>{i + 1}</span>
              <span className={styles.pontos} aria-hidden="true">
                {dia &&
                  SITUACOES.filter((s) => dia[s.chave] > 0).map((s) => (
                    <span key={s.chave} className={styles.ponto} style={{ background: `var(${s.token})` }} />
                  ))}
              </span>
            </button>
          );
        })}
      </div>

      <ul className={styles.legenda}>
        {SITUACOES.map((s) => (
          <li key={s.chave} className={styles.itemLegenda}>
            <span className={styles.ponto} style={{ background: `var(${s.token})` }} aria-hidden="true" />
            {s.rotulo}
          </li>
        ))}
      </ul>
    </div>
  );
}
