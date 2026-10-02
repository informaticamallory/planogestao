import type { IndicadoresPlano } from "@planogestao/shared-types";
import { useMemo } from "react";
import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useEscalaFonte } from "../../../store/aparenciaStore";
import { lerToken, useTemaAtual } from "../../../utils/tokens";
import { GraficoStatusAcoes } from "../../dashboard/GraficoStatusAcoes";
import { Card } from "../../ui/Card";
import styles from "./AbasPlano.module.css";

export function AbaIndicadores({ indicadores: i }: { indicadores: IndicadoresPlano | undefined }) {
  const tema = useTemaAtual();
  // Medidas do SVG em px do tamanho padrão × escala da fonte do usuário.
  const escala = useEscalaFonte();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- relê as cores ao trocar o tema
  const cores = useMemo(() => ({ barra: lerToken("--cor-primaria"), eixo: lerToken("--cor-grafico-eixo") }), [tema]);
  if (!i) return <p className={styles.estado}>Carregando indicadores…</p>;

  const statusAcoes = {
    total: i.total_acoes,
    fatias: [
      { categoria: "pendente" as const, total: i.pendentes },
      { categoria: "em_andamento" as const, total: i.em_andamento },
      { categoria: "concluida" as const, total: i.concluidas },
    ],
  };

  // Série única por situação do prazo (contada à parte do status): em aberto pelas tags, depois as concluídas.
  const prazo = [
    { situacao: "Em atraso", total: i.atrasadas },
    { situacao: "A vencer", total: i.a_vencer },
    { situacao: "No prazo", total: i.no_prazo },
    { situacao: "Concluídas no prazo", total: i.concluidas_no_prazo },
    { situacao: "Concluídas com atraso", total: i.concluidas_com_atraso },
  ];

  return (
    <div className={styles.gradeIndicadores}>
      <Card titulo="Status das ações" vazio={i.total_acoes === 0} mensagemVazio="Nenhuma ação cadastrada.">
        <GraficoStatusAcoes dados={statusAcoes} />
      </Card>

      <Card titulo="Cumprimento de prazo" vazio={i.total_acoes === 0} mensagemVazio="Nenhuma ação cadastrada.">
        <div className={styles.destaqueCumprimento}>
          <span className={styles.valorDestaque}>
            {i.percentual_cumprimento === null ? "—" : `${i.percentual_cumprimento.toLocaleString("pt-BR")}%`}
          </span>
          <span className={styles.rotuloDestaque}>
            das ações vencidas ou concluídas foram entregues até o prazo
            {i.percentual_cumprimento === null && " (ainda sem ações vencidas ou concluídas)"}
          </span>
        </div>
        <ResponsiveContainer width="100%" height={200 * escala}>
          <BarChart data={prazo} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 8 }}>
            <XAxis type="number" allowDecimals={false} hide />
            <YAxis
              type="category"
              dataKey="situacao"
              width={160 * escala}
              tickLine={false}
              axisLine={false}
              tick={{ fill: cores.eixo, fontSize: 12 * escala }}
            />
            <Tooltip cursor={{ fillOpacity: 0.06 }} formatter={(v: number) => [v, "Ações"]} />
            <Bar dataKey="total" fill={cores.barra} radius={[0, 4, 4, 0]} barSize={16} isAnimationActive={false}>
              <LabelList dataKey="total" position="right" style={{ fontSize: 12 * escala, fill: "currentColor" }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
