import { ApiError } from "@planogestao/api-client";
import type { EquipeDetalhe } from "@planogestao/shared-types";
import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import styles from "../../components/admin/Admin.module.css";
import estilos from "../../components/equipes/Equipes.module.css";
import { ModalExcluirEquipe, rotuloPlano } from "../../components/equipes/ModalExcluirEquipe";
import { Avatar } from "../../components/ui/Avatar";
import { Badge } from "../../components/ui/Badge";
import { Button, ButtonLink } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Icon } from "../../components/ui/Icon";
import { Table } from "../../components/ui/Table";
import { Tabs } from "../../components/ui/Tabs";
import { useDesempenhoEquipe, useEquipe, useHistoricoEquipe, useSituacaoEquipe } from "../../hooks/useEquipes";
import { formatarData, formatarDataDoInstante, formatarDataHora } from "../../utils/datas";
import { SelosEquipe } from "./EquipesPage";

type Aba = "participantes" | "desempenho" | "historico";
const ABAS: Aba[] = ["participantes", "desempenho", "historico"];
const pct = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("pt-BR")}%`);

export function EquipeDetalhePage() {
  const navigate = useNavigate();
  const equipeId = Number(useParams().id);
  const [params, setParams] = useSearchParams();
  const aba: Aba = ABAS.includes(params.get("aba") as Aba) ? (params.get("aba") as Aba) : "participantes";
  const equipe = useEquipe(equipeId);
  const situacao = useSituacaoEquipe();
  const [excluindo, setExcluindo] = useState(false);

  if (equipe.error instanceof ApiError && equipe.error.status === 404) {
    return (
      <div className={styles.pagina}>
        <h1 className={styles.titulo}>Equipe não encontrada</h1>
        <p className={styles.subtitulo}>
          Ela pode ter sido excluída, ou você não tem acesso ao plano dela. <Link to="/equipes">Voltar para Equipes</Link>
        </p>
      </div>
    );
  }
  if (equipe.error) return <p className={styles.erro}>Não foi possível carregar a equipe: {equipe.error.message}</p>;
  if (!equipe.data) return <p className={styles.estado}>Carregando…</p>;
  const e = equipe.data;
  const irPara = (id: Aba) => setParams((p) => ({ ...Object.fromEntries(p), aba: id }), { replace: true });

  return (
    <div className={styles.pagina}>
      <header className={estilos.cabecalhoDetalhe}>
        <div>
          <Link to="/equipes" className={estilos.migalha}>
            <Icon name="chevronLeft" size={15} />
            Equipes
          </Link>
          <h1 className={styles.titulo}>{e.nome}</h1>
          <div className={estilos.selos}>
            <SelosEquipe equipe={e} />
          </div>
          <p className={estilos.dados}>
            <span>
              Plano <strong>{rotuloPlano(e)}</strong>
            </span>
            <span>
              Área <strong>{e.area.nome}</strong>
            </span>
            <span>
              Coordenador <strong>{e.coordenador.nome}</strong>
            </span>
            {e.criado_por && (
              <span>
                Criada por <strong>{e.criado_por.nome}</strong> em {formatarDataDoInstante(e.criado_em)}
              </span>
            )}
          </p>
        </div>
        <div className={styles.barra}>
          {/* A equipe só é visível a quem tem acesso ao plano: o botão abre o plano com o acesso do usuário. */}
          {e.plano && (
            <ButtonLink to={`/planos/${e.plano.id}`}>
              <Icon name="arrowUpRight" size={15} /> Abrir plano
            </ButtonLink>
          )}
          {e.pode_gerenciar && (
            <>
              <Button variante="perigo" onClick={() => setExcluindo(true)}>
                Excluir
              </Button>
              <Button disabled={situacao.isPending} onClick={() => situacao.mutate({ id: e.id, ativo: !e.ativo })}>
                {e.ativo ? "Inativar" : "Ativar"}
              </Button>
              <ButtonLink to={`/equipes/${e.id}/editar`} variante="primaria">
                Editar
              </ButtonLink>
            </>
          )}
        </div>
      </header>

      {e.somente_leitura && (
        <p className={estilos.aviso} role="status">
          {e.somente_leitura}
        </p>
      )}
      {!e.plano && (
        <p className={estilos.aviso} role="status">
          Equipe cadastrada antes do vínculo com planos. {e.pode_gerenciar ? "Edite a equipe para vincular o plano." : "Peça a quem gerencia a área para vincular o plano."}
        </p>
      )}
      {situacao.error && <p className={styles.erro}>{situacao.error.message}</p>}

      <Card>
        <h2 className={estilos.tituloSecao}>Descrição / Objetivo</h2>
        <p className={estilos.descricao}>{e.descricao ?? <span className={styles.meta}>Sem descrição.</span>}</p>
      </Card>

      <Tabs<Aba>
        rotulo="Seções da equipe"
        ativa={aba}
        onSelecionar={irPara}
        abas={[
          { id: "participantes", rotulo: "Participantes", contador: e.total_participantes },
          { id: "desempenho", rotulo: "Desempenho no plano" },
          { id: "historico", rotulo: "Histórico" },
        ]}
      >
        {aba === "participantes" && <AbaParticipantes equipe={e} />}
        {aba === "desempenho" && <AbaDesempenho equipeId={e.id} />}
        {aba === "historico" && <AbaHistorico equipeId={e.id} />}
      </Tabs>

      <ModalExcluirEquipe equipe={excluindo ? e : null} onFechar={() => setExcluindo(false)} onExcluida={() => navigate("/equipes", { replace: true })} />
    </div>
  );
}

function AbaParticipantes({ equipe }: { equipe: EquipeDetalhe }) {
  if (equipe.participantes.length === 0) return <p className={styles.estado}>Nenhum participante.</p>;
  return (
    <Card semPadding>
      <Table>
        <thead>
          <tr>
            <th scope="col">Participante</th>
            <th scope="col">Área / Função/Cargo</th>
            <th scope="col" className={estilos.colSecundaria}>
              Na equipe desde
            </th>
          </tr>
        </thead>
        <tbody>
          {equipe.participantes.map((p) => (
            <tr key={p.usuario_id} data-inativo={p.ativo ? undefined : true}>
              <td>
                <div className={estilos.membro}>
                  <Avatar nome={p.nome} url={p.avatar_url} tamanho="sm" />
                  <span>
                    {p.nome} {p.coordenador && <Badge tom="primaria">Coordenador</Badge>}
                    {!p.ativo && " · conta inativa"}
                    <span className={styles.meta}>
                      {p.email}
                      {p.papel_na_equipe && ` · papel: ${p.papel_na_equipe}`}
                    </span>
                  </span>
                </div>
              </td>
              <td>
                {p.area ?? "Sem área"}
                <span className={styles.meta}>{p.funcao_cargo ?? "Sem função/cargo"}</span>
              </td>
              <td className={estilos.colSecundaria}>{formatarData(p.data_entrada)}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

function AbaDesempenho({ equipeId }: { equipeId: number }) {
  const q = useDesempenhoEquipe(equipeId);
  if (q.error) return <p className={styles.erro}>Não foi possível carregar: {q.error.message}</p>;
  if (!q.data) return <p className={styles.estado}>Carregando…</p>;
  const d = q.data;
  if (!d.disponivel) return <p className={styles.estado}>{d.criterio}</p>;
  const g = d.geral;
  const cartoes: [string, string | number][] = [
    ["Ações da equipe", `${g.total} de ${d.acoes_do_plano}`],
    ["Concluídas", g.concluidas],
    ["Em aberto", g.em_aberto],
    ["Em atraso", d.plano_arquivado ? "—" : g.em_atraso],
    ["% no prazo", pct(g.percentual_no_prazo)],
  ];
  return (
    <div className={estilos.desempenhoAba}>
      <p className={estilos.criterio}>
        <strong>Critério:</strong> {d.criterio}
        {d.plano_arquivado && " Plano arquivado: sem situação de prazo."}
      </p>
      <div className={estilos.cartoes}>
        {cartoes.map(([rotulo, valor]) => (
          <Card key={rotulo}>
            <span className={styles.meta}>{rotulo}</span>
            <strong className={estilos.numero}>{valor}</strong>
          </Card>
        ))}
      </div>
      <Card semPadding>
        <Table legenda="Por participante (cada ação conta uma vez, para o responsável)">
          <thead>
            <tr>
              <th scope="col">Participante</th>
              <th scope="col" data-numerico>
                Ações
              </th>
              <th scope="col" data-numerico>
                Concluídas
              </th>
              <th scope="col" data-numerico>
                Em atraso
              </th>
              <th scope="col" data-numerico>
                % no prazo
              </th>
            </tr>
          </thead>
          <tbody>
            {d.participantes.map((p) => (
              <tr key={p.usuario_id}>
                <td>{p.nome}</td>
                <td data-numerico>{p.total}</td>
                <td data-numerico>{p.concluidas}</td>
                <td data-numerico>{d.plano_arquivado ? "—" : p.em_atraso}</td>
                <td data-numerico>{pct(p.percentual_no_prazo)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

function AbaHistorico({ equipeId }: { equipeId: number }) {
  const q = useHistoricoEquipe(equipeId);
  if (q.error) return <p className={styles.erro}>Não foi possível carregar: {q.error.message}</p>;
  if (!q.data) return <p className={styles.estado}>Carregando…</p>;
  if (q.data.length === 0) return <p className={styles.estado}>Nenhum registro (equipe cadastrada antes da auditoria de equipes).</p>;
  return (
    <Card>
      <ol className={estilos.historico}>
        {q.data.map((h) => (
          <li key={h.id}>
            <time dateTime={h.criado_em} className={styles.meta}>
              {formatarDataHora(h.criado_em)}
            </time>
            <p>
              <strong>{h.autor?.nome ?? "Usuário removido"}</strong> — {h.descricao}
            </p>
          </li>
        ))}
      </ol>
    </Card>
  );
}
