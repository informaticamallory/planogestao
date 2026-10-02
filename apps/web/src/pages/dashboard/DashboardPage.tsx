import { useState } from "react";
import { Link } from "react-router-dom";

import { SeletorPeriodo } from "../../components/dashboard/SeletorPeriodo";
import { BotaoPersonalizar, PainelWidgets } from "../../components/painel/PainelWidgets";
import { useResumoDashboard } from "../../hooks/useDashboard";
import { filtroComoQuery, useFiltroPeriodo } from "../../hooks/useFiltroPeriodo";
import { usePainel } from "../../hooks/usePainel";
import { formatarData } from "../../utils/datas";
import styles from "./DashboardPage.module.css";
import { FONTES_DASHBOARD } from "./fontesDashboard";

export function DashboardPage() {
  const { filtro } = useFiltroPeriodo();
  // Só para o subtítulo com as datas do período (os cards usam a mesma consulta, sem nova chamada).
  const resumo = useResumoDashboard(filtro);
  const painel = usePainel("dashboard");
  const [colunas, setColunas] = useState(12);
  const r = resumo.data;

  return (
    <div className={styles.dashboardPage}>
      <header className={styles.cabecalho}>
        <div>
          <h1 className={styles.titulo}>Dashboard</h1>
          {r && (
            <p className={styles.subtitulo}>
              {formatarData(r.periodo.inicio)} a {formatarData(r.periodo.fim)} · PAs ativos (arquivados ficam de fora), ações e
              sub-itens criados no período, cada um contado uma vez · <Link to={`/indicadores?${filtroComoQuery(filtro)}`}>Ver detalhamento em Indicadores</Link>
              {resumo.isFetching && !resumo.isLoading && " · atualizando…"}
            </p>
          )}
        </div>
        <div className={styles.acoesCabecalho}>
          <SeletorPeriodo />
          <BotaoPersonalizar painel={painel} larguraSuficiente={colunas === 12} />
        </div>
      </header>

      <PainelWidgets painel={painel} fontes={FONTES_DASHBOARD} onColunas={setColunas} />
    </div>
  );
}
