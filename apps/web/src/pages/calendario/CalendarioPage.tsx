import type { FiltrosCalendario } from "@planogestao/api-client";
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import styles from "../../components/calendario/Calendario.module.css";
import { PainelDia } from "../../components/calendario/PainelDia";
import { GradeMes, VisaoLista, VisaoSemana } from "../../components/calendario/VisoesCalendario";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { Select } from "../../components/ui/Select";
import { DeadlineStatusLabel } from "../../components/ui/StatusBadges";
import { useCalendarioIntervalo, useCalendarioMensal } from "../../hooks/useCalendario";
import { useOpcoesPlanos } from "../../hooks/usePlanos";
import {
  diasDaGradeMensal,
  formatarData,
  formatarMesAnoLongo,
  inicioDaSemana,
  paraData,
  paraIsoData,
  primeiroDoMes,
  somarDias,
  somarMeses,
  ultimoDoMes,
} from "../../utils/datas";
import { SITUACOES_PRAZO } from "../../utils/rotulos";

type Visao = "mes" | "semana" | "lista";
const VISOES: { id: Visao; rotulo: string }[] = [
  { id: "mes", rotulo: "Mês" },
  { id: "semana", rotulo: "Semana" },
  { id: "lista", rotulo: "Lista" },
];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const idPositivo = (v: string | null) => (v && Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : undefined);

export function CalendarioPage() {
  // Tudo na URL: navegar entre meses só troca `data`; filtros e visão permanecem.
  const [params, setParams] = useSearchParams();
  const visao: Visao = VISOES.some((v) => v.id === params.get("visao")) ? (params.get("visao") as Visao) : "mes";
  const hojeIso = paraIsoData(new Date());
  const dataRef = paraData(ISO.test(params.get("data") ?? "") ? params.get("data")! : hojeIso);
  const diaAberto = ISO.test(params.get("dia") ?? "") ? params.get("dia") : null;
  const filtros: FiltrosCalendario = useMemo(
    () => ({ area_id: idPositivo(params.get("area_id")), responsavel_id: idPositivo(params.get("responsavel_id")) }),
    [params],
  );

  const atualizar = (mudancas: Record<string, string | null>) =>
    setParams((atual) => {
      const p = new URLSearchParams(atual);
      for (const [k, v] of Object.entries(mudancas)) {
        if (v === null || v === "") p.delete(k);
        else p.set(k, v);
      }
      return p;
    });

  const opcoes = useOpcoesPlanos();

  // Intervalo carregado conforme a visão.
  const semanaInicio = inicioDaSemana(dataRef);
  const diasSemana = Array.from({ length: 7 }, (_, i) => somarDias(semanaInicio, i));
  const [inicio, fim] =
    visao === "semana" ? [semanaInicio, diasSemana[6]!] : [primeiroDoMes(dataRef), ultimoDoMes(dataRef)];

  const mensal = useCalendarioMensal(dataRef.getFullYear(), dataRef.getMonth() + 1, filtros, visao === "mes");
  const intervalo = useCalendarioIntervalo(paraIsoData(inicio), paraIsoData(fim), filtros, visao !== "mes");
  const carregando = visao === "mes" ? mensal.isLoading : intervalo.isLoading;
  const erro = visao === "mes" ? mensal.error : intervalo.error;
  const atualizando = (visao === "mes" ? mensal.isFetching : intervalo.isFetching) && !carregando;

  const resumoPorData = useMemo(() => new Map((mensal.data?.dias ?? []).map((d) => [d.data, d])), [mensal.data]);
  const totalPeriodo = visao === "mes" ? mensal.data?.total : intervalo.data?.length;

  const navegar = (sentido: -1 | 1) => {
    const nova = visao === "semana" ? somarDias(dataRef, 7 * sentido) : somarMeses(dataRef, sentido);
    atualizar({ data: paraIsoData(nova), dia: null });
  };

  const tituloPeriodo =
    visao === "semana" ? `${formatarData(paraIsoData(inicio))} a ${formatarData(paraIsoData(fim))}` : formatarMesAnoLongo(dataRef);
  const temFiltro = filtros.area_id !== undefined || filtros.responsavel_id !== undefined;

  return (
    <div className={styles.pagina}>
      <header className={styles.cabecalho}>
        <h1 className={styles.titulo}>Calendário de Ações</h1>

        <div className={styles.filtros}>
          <label className={styles.campo}>
            <span className={styles.rotulo}>Área</span>
            <Select compacto value={filtros.area_id ?? ""} onChange={(e) => atualizar({ area_id: e.target.value, dia: null })}>
              <option value="">Todas</option>
              {opcoes.data?.areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </Select>
          </label>
          <label className={styles.campo}>
            <span className={styles.rotulo}>Responsável</span>
            <Select compacto value={filtros.responsavel_id ?? ""} onChange={(e) => atualizar({ responsavel_id: e.target.value, dia: null })}>
              <option value="">Todos</option>
              {opcoes.data?.responsaveis.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                </option>
              ))}
            </Select>
          </label>
          {temFiltro && (
            <Button variante="link" onClick={() => atualizar({ area_id: null, responsavel_id: null, dia: null })}>
              Limpar filtros
            </Button>
          )}
        </div>
      </header>

      <div className={styles.barra}>
        <div className={styles.navegacao}>
          <Button variante="icone" onClick={() => navegar(-1)} aria-label={visao === "semana" ? "Semana anterior" : "Mês anterior"}>
            <Icon name="chevronLeft" size={17} />
          </Button>
          <Button onClick={() => atualizar({ data: null, dia: null })}>Hoje</Button>
          <Button variante="icone" onClick={() => navegar(1)} aria-label={visao === "semana" ? "Próxima semana" : "Próximo mês"}>
            <Icon name="chevronRight" size={17} />
          </Button>
          <h2 className={styles.periodo} aria-live="polite">
            {tituloPeriodo}
            {totalPeriodo !== undefined && <span className={styles.totalPeriodo}> · {totalPeriodo} ação(ões)</span>}
          </h2>
          {atualizando && <span className={styles.rotulo}>Atualizando…</span>}
        </div>

        <div className={styles.alternador} role="group" aria-label="Visualização">
          {VISOES.map((v) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={visao === v.id}
              className={visao === v.id ? `${styles.opcaoVisao} ${styles.opcaoVisaoAtiva}` : styles.opcaoVisao}
              onClick={() => atualizar({ visao: v.id === "mes" ? null : v.id })}
            >
              {v.rotulo}
            </button>
          ))}
        </div>
      </div>

      <ul className={styles.legenda}>
        {SITUACOES_PRAZO.map((s) => (
          <li key={s.situacao}>
            <DeadlineStatusLabel situacao={s.situacao} />
          </li>
        ))}
      </ul>

      {erro ? (
        <p className={styles.erro}>Não foi possível carregar o calendário: {erro.message}</p>
      ) : carregando ? (
        <p className={styles.vazio}>Carregando…</p>
      ) : visao === "mes" ? (
        <GradeMes
          dias={diasDaGradeMensal(dataRef)}
          mesReferencia={dataRef.getMonth()}
          resumoPorData={resumoPorData}
          hojeIso={hojeIso}
          diaAberto={diaAberto}
          onAbrirDia={(iso) => atualizar({ dia: iso })}
        />
      ) : visao === "semana" ? (
        <VisaoSemana dias={diasSemana} acoes={intervalo.data ?? []} hojeIso={hojeIso} onAbrirDia={(iso) => atualizar({ dia: iso })} />
      ) : (
        <VisaoLista acoes={intervalo.data ?? []} onAbrirDia={(iso) => atualizar({ dia: iso })} />
      )}

      {diaAberto && <PainelDia data={diaAberto} filtros={filtros} onFechar={() => atualizar({ dia: null })} />}
    </div>
  );
}
