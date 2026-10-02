import type { AcaoCalendario, DiaCalendarioResumo } from "@planogestao/shared-types";
import { Link } from "react-router-dom";

import { formatarData, formatarDiaDaSemana, paraIsoData } from "../../utils/datas";
import { SITUACOES_PRAZO } from "../../utils/rotulos";
import { Icon } from "../ui/Icon";
import { DeadlineStatusLabel } from "../ui/StatusBadges";
import styles from "./Calendario.module.css";

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const CONTADOR: Record<(typeof SITUACOES_PRAZO)[number]["situacao"], keyof DiaCalendarioResumo> = {
  atrasada: "atrasadas",
  vencendo: "vencendo",
  em_andamento: "em_andamento",
  concluida: "concluidas",
};

export function descreverDia(iso: string, dia: DiaCalendarioResumo | undefined): string {
  if (!dia || dia.total === 0) return `${formatarData(iso)}: nenhuma ação`;
  const partes = SITUACOES_PRAZO.filter((s) => (dia[CONTADOR[s.situacao]] as number) > 0).map(
    (s) => `${dia[CONTADOR[s.situacao]]} ${s.plural}`,
  );
  return `${formatarData(iso)}: ${dia.total} ação(ões) — ${partes.join(", ")}`;
}

/** Indicadores do dia: um por situação presente, com a contagem. */
function Indicadores({ dia }: { dia: DiaCalendarioResumo }) {
  return (
    <span className={styles.indicadores} aria-hidden="true">
      {SITUACOES_PRAZO.filter((s) => (dia[CONTADOR[s.situacao]] as number) > 0).map((s) => (
        <span key={s.situacao} className={styles.indicador}>
          <Icon name={s.icone} size={12} strokeWidth={2.4} color={`var(${s.corToken})`} />
          <span className={styles.numeroIndicador}>{dia[CONTADOR[s.situacao]] as number}</span>
        </span>
      ))}
    </span>
  );
}

interface GradeMesProps {
  dias: Date[];
  mesReferencia: number;
  resumoPorData: Map<string, DiaCalendarioResumo>;
  hojeIso: string;
  diaAberto: string | null;
  onAbrirDia: (iso: string) => void;
}

export function GradeMes({ dias, mesReferencia, resumoPorData, hojeIso, diaAberto, onAbrirDia }: GradeMesProps) {
  return (
    <div className={styles.gradeMes}>
      {DIAS_SEMANA.map((d) => (
        <span key={d} className={styles.cabecalhoDia} aria-hidden="true">
          {d}
        </span>
      ))}
      {dias.map((d) => {
        const iso = paraIsoData(d);
        const foraDoMes = d.getMonth() !== mesReferencia;
        const resumo = foraDoMes ? undefined : resumoPorData.get(iso);
        const classes = [
          styles.celula,
          foraDoMes && styles.foraDoMes,
          iso === hojeIso && styles.hoje,
          iso === diaAberto && styles.selecionado,
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <button
            key={iso}
            type="button"
            className={classes}
            disabled={foraDoMes}
            aria-label={descreverDia(iso, resumo)}
            onClick={() => onAbrirDia(iso)}
          >
            <span className={styles.numeroDia}>{d.getDate()}</span>
            {resumo && resumo.total > 0 && (
              <>
                <span className={styles.totalDia}>{resumo.total} ação(ões)</span>
                <Indicadores dia={resumo} />
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function CartaoAcao({ acao }: { acao: AcaoCalendario }) {
  return (
    <Link to={`/acoes/${acao.id}`} className={styles.cartaoAcao}>
      <span className={styles.descricaoAcao}>
        <DeadlineStatusLabel situacao={acao.situacao} soIcone />{" "}
        {acao.descricao}
      </span>
      <span className={styles.metaAcao}>
        {acao.plano.codigo} · {acao.responsavel.nome} · {acao.progresso}%
      </span>
    </Link>
  );
}

interface VisaoSemanaProps {
  dias: Date[];
  acoes: AcaoCalendario[];
  hojeIso: string;
  onAbrirDia: (iso: string) => void;
}

export function VisaoSemana({ dias, acoes, hojeIso, onAbrirDia }: VisaoSemanaProps) {
  return (
    <div className={styles.semana}>
      {dias.map((d) => {
        const iso = paraIsoData(d);
        const doDia = acoes.filter((a) => a.prazo === iso);
        return (
          <section key={iso} className={iso === hojeIso ? `${styles.colunaSemana} ${styles.hoje}` : styles.colunaSemana} aria-label={formatarDiaDaSemana(iso)}>
            <button type="button" className={styles.tituloColunaSemana} onClick={() => onAbrirDia(iso)}>
              <span>{DIAS_SEMANA[d.getDay()]}</span>
              <span className={styles.numeroDia}>{d.getDate()}</span>
              <span className={styles.totalDia}>{doDia.length} ação(ões)</span>
            </button>
            {doDia.map((a) => (
              <CartaoAcao key={a.id} acao={a} />
            ))}
          </section>
        );
      })}
    </div>
  );
}

export function VisaoLista({ acoes, onAbrirDia }: { acoes: AcaoCalendario[]; onAbrirDia: (iso: string) => void }) {
  const grupos = new Map<string, AcaoCalendario[]>();
  for (const a of acoes) grupos.set(a.prazo, [...(grupos.get(a.prazo) ?? []), a]);
  if (grupos.size === 0) return <p className={styles.vazio}>Nenhuma ação com prazo neste mês.</p>;

  return (
    <ol className={styles.lista}>
      {[...grupos].map(([iso, doDia]) => (
        <li key={iso} className={styles.grupoLista}>
          <button type="button" className={styles.tituloGrupo} onClick={() => onAbrirDia(iso)}>
            {formatarDiaDaSemana(iso)} — {doDia.length} ação(ões)
          </button>
          <div className={styles.itensGrupo}>
            {doDia.map((a) => (
              <CartaoAcao key={a.id} acao={a} />
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}
