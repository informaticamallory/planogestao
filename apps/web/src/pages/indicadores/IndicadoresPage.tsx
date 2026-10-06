import type { FiltrosIndicadores } from "@planogestao/api-client";
import type { TipoPeriodo } from "@planogestao/shared-types";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { ContextoFonteIndicadores, FONTES_INDICADORES } from "../../components/indicadores/fontesIndicadores";
import styles from "../../components/indicadores/Indicadores.module.css";
import { BotaoPersonalizar, PainelWidgets } from "../../components/painel/PainelWidgets";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { useIndicadoresGerais } from "../../hooks/useIndicadores";
import { usePainel } from "../../hooks/usePainel";
import { useOpcoesPlanos } from "../../hooks/usePlanos";
import { formatarData } from "../../utils/datas";
import { ROTULO_PERIODO } from "../../utils/rotulos";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const idPositivo = (v: string | null) => (v && Number(v) > 0 && Number.isInteger(Number(v)) ? Number(v) : undefined);

export function IndicadoresPage() {
  // Filtros na URL: compartilhar/recarregar mantém a análise; todos os gráficos leem daqui.
  const [params, setParams] = useSearchParams();
  const periodoBruto = params.get("periodo");
  const periodo: TipoPeriodo = periodoBruto && periodoBruto in ROTULO_PERIODO ? (periodoBruto as TipoPeriodo) : "ano";
  const dataInicio = params.get("data_inicio") ?? "";
  const dataFim = params.get("data_fim") ?? "";
  const personalizadoValido = ISO.test(dataInicio) && ISO.test(dataFim) && dataInicio <= dataFim;

  const filtros: FiltrosIndicadores = useMemo(() => {
    // Personalizado incompleto: usa "ano" até as duas datas estarem válidas.
    const base: FiltrosIndicadores =
      periodo === "personalizado"
        ? personalizadoValido
          ? { periodo, data_inicio: dataInicio, data_fim: dataFim }
          : { periodo: "ano" }
        : { periodo };
    return {
      ...base,
      area_id: idPositivo(params.get("area_id")),
      setor_id: idPositivo(params.get("setor_id")),
      responsavel_id: idPositivo(params.get("responsavel_id")),
    };
  }, [params, periodo, dataInicio, dataFim, personalizadoValido]);

  const atualizar = (mudancas: Record<string, string | null>) =>
    setParams(
      (atual) => {
        const p = new URLSearchParams(atual);
        for (const [chave, valor] of Object.entries(mudancas)) {
          if (!valor) p.delete(chave);
          else p.set(chave, valor);
        }
        return p;
      },
      { replace: true },
    );

  const opcoes = useOpcoesPlanos();
  const setores = (opcoes.data?.setores ?? []).filter((s) => !filtros.area_id || s.area_id === filtros.area_id);

  // Só para o "Atualizando…" do subtítulo (os KPIs usam a mesma consulta, sem nova chamada).
  const gerais = useIndicadoresGerais(filtros);
  const painel = usePainel("indicadores");
  const [colunas, setColunas] = useState(12);
  const contexto = useMemo(() => ({ filtros }), [filtros]);

  const temFiltro = !!(filtros.area_id || filtros.setor_id || filtros.responsavel_id);

  return (
    <div className={styles.pagina}>
      <header className={styles.cabecalho}>
        <div>
          <h1 className={styles.titulo}>Indicadores</h1>
          <p className={styles.subtitulo}>
            PAs ativos criados no período (arquivados ficam de fora), filtrados pela área, função/cargo e responsável do plano. Ações
            principais e sub-itens de todos os níveis contam uma vez cada; recusados e cancelados ficam de fora.
            {gerais.isFetching && !gerais.isLoading && " Atualizando…"}
          </p>
        </div>

        <div className={styles.filtros}>
          <label className={styles.campo}>
            <span className={styles.rotulo}>Período</span>
            <Select compacto value={periodo} onChange={(e) => atualizar({ periodo: e.target.value === "ano" ? null : e.target.value })}>
              {(Object.keys(ROTULO_PERIODO) as TipoPeriodo[]).map((p) => (
                <option key={p} value={p}>
                  {ROTULO_PERIODO[p]}
                </option>
              ))}
            </Select>
          </label>
          {periodo === "personalizado" && (
            <>
              <label className={styles.campo}>
                <span className={styles.rotulo}>De</span>
                <Input compacto type="date" value={dataInicio} max={dataFim || undefined} onChange={(e) => atualizar({ data_inicio: e.target.value })} />
              </label>
              <label className={styles.campo}>
                <span className={styles.rotulo}>Até</span>
                <Input compacto type="date" value={dataFim} min={dataInicio || undefined} onChange={(e) => atualizar({ data_fim: e.target.value })} />
              </label>
            </>
          )}
          <label className={styles.campo}>
            <span className={styles.rotulo}>Área</span>
            <Select
              compacto
              value={filtros.area_id ?? ""}
              onChange={(e) => {
                // Função/cargo de outra área deixaria o conjunto vazio sem motivo aparente.
                const area = Number(e.target.value) || undefined;
                const setorValido = opcoes.data?.setores.some((s) => s.id === filtros.setor_id && s.area_id === area);
                atualizar({ area_id: e.target.value || null, setor_id: area && !setorValido ? null : params.get("setor_id") });
              }}
            >
              <option value="">Todas</option>
              {opcoes.data?.areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </Select>
          </label>
          <label className={styles.campo}>
            <span className={styles.rotulo}>Função/Cargo</span>
            <Select compacto value={filtros.setor_id ?? ""} onChange={(e) => atualizar({ setor_id: e.target.value || null })}>
              <option value="">Todas</option>
              {setores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </Select>
          </label>
          <label className={styles.campo}>
            <span className={styles.rotulo}>Responsável pelo plano</span>
            <Select compacto value={filtros.responsavel_id ?? ""} onChange={(e) => atualizar({ responsavel_id: e.target.value || null })}>
              <option value="">Todos</option>
              {opcoes.data?.responsaveis.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                </option>
              ))}
            </Select>
          </label>
          {temFiltro && (
            <Button variante="link" onClick={() => atualizar({ area_id: null, setor_id: null, responsavel_id: null })}>
              Limpar filtros
            </Button>
          )}
          <BotaoPersonalizar painel={painel} larguraSuficiente={colunas === 12} />
        </div>
      </header>

      {periodo === "personalizado" && !personalizadoValido && (
        <p className={styles.subtitulo}>Informe as duas datas do período personalizado. Enquanto isso, é exibido o ano atual.</p>
      )}

      <ContextoFonteIndicadores.Provider value={contexto}>
        <PainelWidgets painel={painel} fontes={FONTES_INDICADORES} onColunas={setColunas} />
      </ContextoFonteIndicadores.Provider>

      <p className={styles.subtitulo}>
        Período analisado: {ROTULO_PERIODO[filtros.periodo]}
        {filtros.data_inicio && filtros.data_fim && ` (${formatarData(filtros.data_inicio)} a ${formatarData(filtros.data_fim)})`}.
      </p>
    </div>
  );
}
