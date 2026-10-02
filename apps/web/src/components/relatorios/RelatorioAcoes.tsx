import type { ConsultaRelatorioAcoes } from "@planogestao/api-client";
import type { LinhaRelatorioAcao, StatusAcao, TipoPeriodo } from "@planogestao/shared-types";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { useOpcoesPlanos } from "../../hooks/usePlanos";
import { api } from "../../services/api";
import { formatarData } from "../../utils/datas";
import type { Esquema } from "../../utils/parametrosUrl";
import { ROTULO_PERIODO, ROTULO_PRIORIDADE, ROTULO_STATUS_ACAO, SITUACOES_PRAZO } from "../../utils/rotulos";
import { Card } from "../ui/Card";
import { ActionStatusBadge, DeadlineStatusLabel } from "../ui/StatusBadges";
import { Table } from "../ui/Table";
import { AbaRelatorio, type Filtros } from "./AbaRelatorio";
import { CampoData, CampoSelect, GrupoOpcoes, comPeriodoValido, idOuUndefined, lista } from "./CamposFiltro";
import styles from "./Relatorios.module.css";

const ESQUEMA: Esquema = {
  responsavel_id: "numero",
  plano_id: "numero",
  status: "lista",
  situacao: "lista",
  prazo_de: "texto",
  prazo_ate: "texto",
  periodo: "texto",
  data_inicio: "texto",
  data_fim: "texto",
};

const STATUS: StatusAcao[] = ["aguardando_aceite", "aceita", "em_andamento", "bloqueada", "concluida", "recusada", "cancelada"];

const paraConsulta = (f: Filtros) => comPeriodoValido<Omit<ConsultaRelatorioAcoes, "page" | "page_size">>(f);

export function RelatorioAcoes() {
  const opcoes = useOpcoesPlanos();
  // Lista de planos para o filtro "Plano" (visíveis ao usuário, pelo código).
  const planos = useQuery({
    queryKey: ["planos", "opcoes-relatorio"],
    queryFn: () => api.planos.listar({ page_size: 100, ordenar: "codigo", direcao: "asc", arquivados: "incluir" }),
    staleTime: 60_000,
  });

  return (
    <AbaRelatorio<LinhaRelatorioAcao>
      id="acoes"
      titulo="Relatório de Ações"
      esquema={ESQUEMA}
      consultar={(f, page, page_size) => api.relatorios.acoes({ ...paraConsulta(f), page, page_size })}
      exportar={(f, formato) => api.relatorios.exportarAcoes(paraConsulta(f), formato)}
      renderFiltros={(r, alterar) => (
        <>
          <div className={styles.linhaFiltros}>
            <CampoSelect
              rotulo="Responsável"
              vazio="Todos"
              valor={r.responsavel_id as number | undefined}
              onAlterar={(v) => alterar({ responsavel_id: idOuUndefined(v) })}
              opcoes={(opcoes.data?.responsaveis ?? []).map((u) => ({ valor: u.id, rotulo: u.nome }))}
            />
            <CampoSelect
              rotulo="Plano"
              vazio="Todos"
              valor={r.plano_id as number | undefined}
              onAlterar={(v) => alterar({ plano_id: idOuUndefined(v) })}
              opcoes={(planos.data?.items ?? []).map((p) => ({ valor: p.id, rotulo: `${p.codigo} — ${p.nome}` }))}
            />
            <CampoData rotulo="Prazo de" valor={r.prazo_de as string} max={r.prazo_ate as string} onAlterar={(v) => alterar({ prazo_de: v })} />
            <CampoData rotulo="Prazo até" valor={r.prazo_ate as string} min={r.prazo_de as string} onAlterar={(v) => alterar({ prazo_ate: v })} />
            <CampoSelect
              rotulo="Criadas no período"
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
          </div>
          <div className={styles.linhaFiltros}>
            <GrupoOpcoes
              rotulo="Situação (atrasadas, concluídas…)"
              valores={lista(r.situacao)}
              onAlterar={(v) => alterar({ situacao: v })}
              opcoes={SITUACOES_PRAZO.map((s) => ({ valor: s.situacao, rotulo: s.nome }))}
            />
            <GrupoOpcoes
              rotulo="Status"
              valores={lista(r.status)}
              onAlterar={(v) => alterar({ status: v })}
              opcoes={STATUS.map((s) => ({ valor: s, rotulo: ROTULO_STATUS_ACAO[s] }))}
            />
          </div>
        </>
      )}
      renderTabela={(acoes) => (
        <Card semPadding className={styles.quadroTabela}>
          <Table className={styles.tabela}>
            <thead>
              <tr>
                <th>Plano</th>
                <th>Nº</th>
                <th>Ação</th>
                <th>Depende de</th>
                <th>Responsável</th>
                <th>Área / Setor</th>
                <th>Início estimado</th>
                <th>Prazo de conclusão</th>
                <th>Prioridade</th>
                <th>Status</th>
                <th>Situação</th>
                <th data-numerico>Progresso</th>
                <th>No prazo?</th>
              </tr>
            </thead>
            <tbody>
              {acoes.map((a) => {
                const s = SITUACOES_PRAZO.find((x) => x.situacao === a.situacao);
                return (
                  <tr key={a.id}>
                    <td>
                      <Link to={`/planos/${a.plano.id}`} title={a.plano.nome}>
                        {a.plano.codigo}
                      </Link>
                    </td>
                    <td>{a.numero}</td>
                    <td className={styles.colunaTexto}>
                      <Link to={`/acoes/${a.id}`}>{a.descricao}</Link>
                      {a.acao_origem && <div className={styles.legenda}>Sub-item de {a.acao_origem}</div>}
                    </td>
                    <td>{a.depende_de ?? "—"}</td>
                    <td>{a.responsavel}</td>
                    <td>
                      {a.area}
                      {a.setor && ` / ${a.setor}`}
                    </td>
                    <td>{a.prazo_inicio ? formatarData(a.prazo_inicio) : "—"}</td>
                    <td>{formatarData(a.prazo)}</td>
                    <td>{ROTULO_PRIORIDADE[a.prioridade as keyof typeof ROTULO_PRIORIDADE]}</td>
                    <td>
                      <ActionStatusBadge status={a.status} />
                    </td>
                    <td>{s ? <DeadlineStatusLabel situacao={s.situacao} /> : "—"}</td>
                    <td data-numerico>{a.progresso}%</td>
                    <td>{a.no_prazo === null ? "—" : a.no_prazo ? "Sim" : "Não"}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}
    />
  );
}
