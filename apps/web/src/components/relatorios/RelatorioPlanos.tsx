import type { ConsultaRelatorioPlanos } from "@planogestao/api-client";
import type { PlanoListaItem, Prioridade, TipoPeriodo } from "@planogestao/shared-types";
import { Link } from "react-router-dom";

import { PRAZO_FILTRO, STATUS_FILTRO } from "../../hooks/useFiltrosPlanos";
import { useOpcoesPlanos } from "../../hooks/usePlanos";
import { api } from "../../services/api";
import { formatarData } from "../../utils/datas";
import type { Esquema } from "../../utils/parametrosUrl";
import { ROTULO_PERIODO, ROTULO_PRAZO, ROTULO_PRIORIDADE, ROTULO_STATUS_PLANO } from "../../utils/rotulos";
import { Card } from "../ui/Card";
import { PlanStatusBadge, PrazoTag } from "../ui/StatusBadges";
import { Table } from "../ui/Table";
import { AbaRelatorio, type Filtros } from "./AbaRelatorio";
import { CampoData, CampoSelect, GrupoOpcoes, comPeriodoValido, idOuUndefined, lista } from "./CamposFiltro";
import styles from "./Relatorios.module.css";

// Mesmos filtros (e mesma consulta no backend) da listagem de Planos.
const ESQUEMA: Esquema = {
  periodo: "texto",
  data_inicio: "texto",
  data_fim: "texto",
  area_id: "numero",
  setor_id: "numero",
  responsavel_id: "numero",
  status: "lista",
  prazo: "lista",
  arquivados: "texto",
  prioridade: "lista",
  tipo_id: "numero",
  origem_id: "numero",
  ordenar: "texto",
  direcao: "texto",
};

const ORDENACOES = [
  { valor: "codigo", rotulo: "Código" },
  { valor: "nome", rotulo: "Nome" },
  { valor: "data_inicio_estimado", rotulo: "Início estimado" },
  { valor: "data_fim_estimado", rotulo: "Fim estimado" },
  { valor: "prioridade", rotulo: "Prioridade" },
  { valor: "progresso", rotulo: "Progresso" },
  { valor: "area", rotulo: "Área" },
  { valor: "responsavel", rotulo: "Responsável" },
];

const ROTULO_STATUS_FILTRO: Record<string, string> = ROTULO_STATUS_PLANO;
const EXIBICOES = [
  { valor: "somente", rotulo: "Arquivados" },
  { valor: "incluir", rotulo: "Todos (ativos e arquivados)" },
];

const paraConsulta = (f: Filtros) => comPeriodoValido<Omit<ConsultaRelatorioPlanos, "page" | "page_size">>(f);

export function RelatorioPlanos() {
  const opcoes = useOpcoesPlanos();

  return (
    <AbaRelatorio<PlanoListaItem>
      id="planos"
      titulo="Relatório de Planos"
      esquema={ESQUEMA}
      consultar={(f, page, page_size) => api.relatorios.planos({ ...paraConsulta(f), page, page_size })}
      exportar={(f, formato) => api.relatorios.exportarPlanos(paraConsulta(f), formato)}
      renderFiltros={(r, alterar) => {
        const setores = (opcoes.data?.setores ?? []).filter((s) => !r.area_id || s.area_id === r.area_id);
        return (
          <>
            <div className={styles.linhaFiltros}>
              <CampoSelect
                rotulo="Criados no período"
                vazio="Qualquer data"
                valor={r.periodo as string | undefined}
                onAlterar={(v) => alterar({ periodo: v || undefined })}
                opcoes={(Object.keys(ROTULO_PERIODO) as TipoPeriodo[]).map((p) => ({ valor: p, rotulo: ROTULO_PERIODO[p] }))}
              />
              {r.periodo === "personalizado" && (
                <>
                  <CampoData rotulo="De" valor={r.data_inicio as string} max={r.data_fim as string} onAlterar={(v) => alterar({ data_inicio: v })} />
                  <CampoData rotulo="Até" valor={r.data_fim as string} min={r.data_inicio as string} onAlterar={(v) => alterar({ data_fim: v })} />
                </>
              )}
              <CampoSelect
                rotulo="Área"
                vazio="Todas"
                valor={r.area_id as number | undefined}
                onAlterar={(v) => alterar({ area_id: idOuUndefined(v), setor_id: undefined })}
                opcoes={(opcoes.data?.areas ?? []).map((a) => ({ valor: a.id, rotulo: a.nome }))}
              />
              <CampoSelect
                rotulo="Função/Cargo"
                vazio="Todas"
                valor={r.setor_id as number | undefined}
                onAlterar={(v) => alterar({ setor_id: idOuUndefined(v) })}
                opcoes={setores.map((s) => ({ valor: s.id, rotulo: s.nome }))}
              />
              <CampoSelect
                rotulo="Responsável"
                vazio="Todos"
                valor={r.responsavel_id as number | undefined}
                onAlterar={(v) => alterar({ responsavel_id: idOuUndefined(v) })}
                opcoes={(opcoes.data?.responsaveis ?? []).map((u) => ({ valor: u.id, rotulo: u.nome }))}
              />
              <CampoSelect
                rotulo="Tipo"
                vazio="Todos"
                valor={r.tipo_id as number | undefined}
                onAlterar={(v) => alterar({ tipo_id: idOuUndefined(v) })}
                opcoes={(opcoes.data?.tipos ?? []).map((t) => ({ valor: t.id, rotulo: t.nome }))}
              />
              <CampoSelect
                rotulo="Origem"
                vazio="Todas"
                valor={r.origem_id as number | undefined}
                onAlterar={(v) => alterar({ origem_id: idOuUndefined(v) })}
                opcoes={(opcoes.data?.origens ?? []).map((o) => ({ valor: o.id, rotulo: o.nome }))}
              />
              <CampoSelect
                rotulo="Exibição"
                vazio="Ativos"
                valor={r.arquivados as string | undefined}
                onAlterar={(v) => alterar({ arquivados: v || undefined })}
                opcoes={EXIBICOES}
              />
              <CampoSelect
                rotulo="Ordenar por"
                vazio="Mais recentes"
                valor={r.ordenar as string | undefined}
                onAlterar={(v) => alterar({ ordenar: v || undefined, direcao: v ? "asc" : undefined })}
                opcoes={ORDENACOES}
              />
            </div>
            <div className={styles.linhaFiltros}>
              <GrupoOpcoes
                rotulo="Status"
                valores={lista(r.status)}
                onAlterar={(v) => alterar({ status: v })}
                opcoes={STATUS_FILTRO.map((s) => ({ valor: s, rotulo: ROTULO_STATUS_FILTRO[s] }))}
              />
              <GrupoOpcoes
                rotulo="Situação do prazo"
                valores={lista(r.prazo)}
                onAlterar={(v) => alterar({ prazo: v })}
                opcoes={PRAZO_FILTRO.map((t) => ({ valor: t, rotulo: ROTULO_PRAZO[t] }))}
              />
              <GrupoOpcoes
                rotulo="Prioridade"
                valores={lista(r.prioridade)}
                onAlterar={(v) => alterar({ prioridade: v })}
                opcoes={(Object.keys(ROTULO_PRIORIDADE) as Prioridade[]).map((p) => ({ valor: p, rotulo: ROTULO_PRIORIDADE[p] }))}
              />
            </div>
          </>
        );
      }}
      renderTabela={(planos) => (
        <Card semPadding className={styles.quadroTabela}>
          <Table className={styles.tabela}>
            <thead>
              <tr>
                <th>Código</th>
                <th>Nome</th>
                <th>Status</th>
                <th>Prazo</th>
                <th>Prioridade</th>
                <th>Área / Função/Cargo</th>
                <th>Tipo</th>
                <th>Origem</th>
                <th>Responsável</th>
                <th>Início estimado</th>
                <th>Fim estimado</th>
                <th data-numerico>Progresso</th>
                <th data-numerico>Ações concl.</th>
              </tr>
            </thead>
            <tbody>
              {planos.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link to={`/planos/${p.id}`}>{p.codigo}</Link>
                  </td>
                  <td className={styles.colunaTexto}>{p.nome}</td>
                  <td>
                    <PlanStatusBadge status={p.status} />
                    {p.rascunho && <span className={styles.legenda}> Rascunho</span>}
                    {p.arquivado && <span className={styles.legenda}> Arquivado</span>}
                  </td>
                  <td>{p.prazo_tag ? <PrazoTag tag={p.prazo_tag} /> : "—"}</td>
                  <td>{ROTULO_PRIORIDADE[p.prioridade]}</td>
                  <td>
                    {p.area.nome}
                    {p.setor && ` / ${p.setor.nome}`}
                  </td>
                  <td>{p.tipo.nome}</td>
                  <td>{p.origem.nome}</td>
                  <td>{p.responsavel.nome}</td>
                  <td>{formatarData(p.data_inicio_estimado)}</td>
                  <td>{formatarData(p.data_fim_estimado)}</td>
                  <td data-numerico>{p.progresso}%</td>
                  <td data-numerico>
                    {p.acoes_concluidas}/{p.total_acoes}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    />
  );
}
