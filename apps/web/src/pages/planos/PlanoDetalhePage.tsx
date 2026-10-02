import { ApiError } from "@planogestao/api-client";
import { useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";

import { AbaAcoes, lerFiltroAcoes, type FiltroAcoes } from "../../components/planos/detalhe/AbaAcoes";
import { AbaAnexos } from "../../components/planos/detalhe/AbaAnexos";
import { AbaHistorico } from "../../components/planos/detalhe/AbaHistorico";
import { AbaIndicadores } from "../../components/planos/detalhe/AbaIndicadores";
import { AbaResumo } from "../../components/planos/detalhe/AbaResumo";
import { CabecalhoPlano } from "../../components/planos/detalhe/CabecalhoPlano";
import { CartoesIndicadoresPlano } from "../../components/planos/detalhe/CartoesIndicadoresPlano";
import { Button } from "../../components/ui/Button";
import { Tabs } from "../../components/ui/Tabs";
import { usePlanoDetalhe, usePlanoIndicadores } from "../../hooks/usePlano";
import styles from "./PlanoDetalhePage.module.css";

const ABAS = ["resumo", "acoes", "historico", "anexos", "indicadores"] as const;
type IdAba = (typeof ABAS)[number];
const ROTULO_ABA: Record<IdAba, string> = {
  resumo: "Resumo",
  acoes: "Ações",
  historico: "Histórico",
  anexos: "Anexos",
  indicadores: "Indicadores",
};

const ehAba = (v: string | null): v is IdAba => ABAS.includes(v as IdAba);
export function PlanoDetalhePage() {
  const planoId = Number(useParams().id);
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  // Avisos vindos da edição (ex.: prazo de ações após o novo fim estimado).
  const [avisos, setAvisos] = useState<string[]>(() => (location.state as { avisos?: string[] } | null)?.avisos ?? []);

  const detalhe = usePlanoDetalhe(planoId);
  const indicadores = usePlanoIndicadores(planoId);

  // Aba e filtro na URL: recarregar ou compartilhar o link mantém a mesma visão.
  const aba: IdAba = ehAba(params.get("aba")) ? (params.get("aba") as IdAba) : "resumo";
  const categoria = lerFiltroAcoes(params.get("categoria"));
  const irPara = (novaAba: IdAba, novaCategoria: FiltroAcoes | null = null) =>
    setParams(
      () => {
        const p = new URLSearchParams();
        if (novaAba !== "resumo") p.set("aba", novaAba);
        if (novaCategoria) p.set("categoria", novaCategoria);
        return p;
      },
      { replace: true },
    );

  if (!Number.isInteger(planoId) || planoId <= 0 || (detalhe.error instanceof ApiError && detalhe.error.status === 404)) {
    return (
      <div className={styles.estado}>
        <h1>Plano não encontrado</h1>
        <p>O plano não existe ou você não tem acesso a ele.</p>
        <Link to="/planos">Voltar para Planos de Ação</Link>
      </div>
    );
  }
  if (detalhe.error) return <p className={styles.erro}>Não foi possível carregar o plano: {detalhe.error.message}</p>;
  if (!detalhe.data) return <p className={styles.estado}>Carregando plano…</p>;

  const plano = detalhe.data;

  return (
    <div className={styles.planoDetalhePage}>
      <CabecalhoPlano plano={plano} />

      {avisos.length > 0 && (
        <div className={styles.avisos} role="status">
          <ul>
            {avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
          <Button variante="link" onClick={() => setAvisos([])}>
            Dispensar
          </Button>
        </div>
      )}

      <CartoesIndicadoresPlano indicadores={indicadores.data} onFiltrarAcoes={(c) => irPara("acoes", c)} />

      <Tabs
        rotulo="Seções do plano"
        abas={ABAS.map((id) => ({
          id,
          rotulo: ROTULO_ABA[id],
          contador: id === "acoes" ? indicadores.data?.total_acoes : undefined,
        }))}
        ativa={aba}
        onSelecionar={(id) => irPara(id)}
      >
        {aba === "resumo" && <AbaResumo plano={plano} />}
        {aba === "acoes" && <AbaAcoes plano={plano} filtroCategoria={categoria} onFiltrar={(c) => irPara("acoes", c)} />}
        {aba === "historico" && <AbaHistorico planoId={plano.id} />}
        {aba === "anexos" && <AbaAnexos plano={plano} />}
        {aba === "indicadores" && <AbaIndicadores indicadores={indicadores.data} />}
      </Tabs>
    </div>
  );
}
