import type { CategoriaAcao, StatusAcoes } from "@planogestao/shared-types";
import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { useEscalaFonte } from "../../store/aparenciaStore";
import { COR_CATEGORIA, ROTULO_CATEGORIA_ACAO } from "../../utils/rotulos";
import { lerToken, useTemaAtual } from "../../utils/tokens";
import styles from "./Graficos.module.css";

// Só os 3 status de execução (o prazo é contado à parte, nas tags).
const ORDEM: CategoriaAcao[] = ["pendente", "em_andamento", "concluida"];

export function GraficoStatusAcoes({ dados }: { dados: Pick<StatusAcoes, "total" | "fatias"> }) {
  const tema = useTemaAtual();
  // Medidas do SVG em px do tamanho padrão × escala da fonte do usuário.
  const escala = useEscalaFonte();
  const cores = useMemo(
    () => ({
      ...(Object.fromEntries(ORDEM.map((c) => [c, lerToken(COR_CATEGORIA[c])])) as Record<CategoriaAcao, string>),
      superficie: lerToken("--cor-superficie"),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- relê as cores ao trocar o tema
    [tema],
  );

  const porCategoria = new Map(dados.fatias.map((f) => [f.categoria, f.total]));
  const fatias = ORDEM.map((categoria) => ({
    categoria,
    nome: ROTULO_CATEGORIA_ACAO[categoria],
    total: porCategoria.get(categoria) ?? 0,
  }));
  const percentual = (n: number) => (dados.total ? Math.round((100 * n) / dados.total) : 0);

  return (
    <div className={styles.rosca}>
      <div className={styles.areaRosca}>
        <ResponsiveContainer width="100%" height={200 * escala}>
          <PieChart>
            <Pie
              data={fatias.filter((f) => f.total > 0)}
              dataKey="total"
              nameKey="nome"
              innerRadius="62%"
              outerRadius="92%"
              startAngle={90}
              endAngle={-270}
              // Borda da cor da superfície = 2px de separação entre fatias.
              stroke={cores.superficie}
              strokeWidth={2}
              isAnimationActive={false}
            >
              {fatias
                .filter((f) => f.total > 0)
                .map((f) => (
                  <Cell key={f.categoria} fill={cores[f.categoria]} />
                ))}
            </Pie>
            <Tooltip formatter={(valor: number, nome: string) => [`${valor} (${percentual(valor)}%)`, nome]} />
          </PieChart>
        </ResponsiveContainer>
        <div className={styles.centroRosca} aria-hidden="true">
          <span className={styles.totalRosca}>{dados.total}</span>
          <span className={styles.rotuloRosca}>ações</span>
        </div>
      </div>

      {/* Legenda com valores: a identidade nunca depende só da cor. */}
      <ul className={styles.legenda}>
        {fatias.map((f) => (
          <li key={f.categoria} className={styles.itemLegenda}>
            <span className={styles.amostra} style={{ background: cores[f.categoria] }} aria-hidden="true" />
            <span className={styles.nomeLegenda}>{f.nome}</span>
            <span className={styles.valorLegenda}>
              {f.total} <span className={styles.percentualLegenda}>({percentual(f.total)}%)</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
