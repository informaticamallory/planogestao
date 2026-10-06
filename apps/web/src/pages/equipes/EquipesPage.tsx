import type { ConsultaEquipes } from "@planogestao/api-client";
import type { EquipeItem } from "@planogestao/shared-types";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import styles from "../../components/admin/Admin.module.css";
import estilos from "../../components/equipes/Equipes.module.css";
import { ModalExcluirEquipe } from "../../components/equipes/ModalExcluirEquipe";
import { Badge } from "../../components/ui/Badge";
import { ButtonLink, classesDoBotao } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Pagination } from "../../components/ui/Pagination";
import { Select } from "../../components/ui/Select";
import { Table } from "../../components/ui/Table";
import { DropdownItem, DropdownMenu } from "../../components/ui/DropdownMenu";
import { Icon } from "../../components/ui/Icon";
import { useEquipes, useSituacaoEquipe } from "../../hooks/useEquipes";
import { useOpcoesPlanos } from "../../hooks/usePlanos";
import { temPermissao, useAuthStore } from "../../store/authStore";

const TAMANHOS = [20, 50, 100];
const SITUACOES = ["ativas", "inativas", "sem_plano"] as const;
type Situacao = (typeof SITUACOES)[number];
const idPositivo = (v: string | null) => (v && Number(v) > 0 ? Number(v) : undefined);

/** Situação da equipe (e se o plano dela está arquivado). */
export function SelosEquipe({ equipe }: { equipe: EquipeItem }) {
  return (
    <span className={estilos.selos}>
      <Badge tom={equipe.ativo ? "sucesso" : "neutro"}>{equipe.ativo ? "Ativa" : "Inativa"}</Badge>
      {!equipe.plano && <Badge tom="aviso">Sem plano vinculado</Badge>}
      {equipe.plano?.arquivado && <Badge tom="neutro">Plano arquivado</Badge>}
    </span>
  );
}

export function EquipesPage() {
  const navigate = useNavigate();
  const usuario = useAuthStore((s) => s.usuario);
  const podeCriar = temPermissao(usuario, "equipes:gerenciar");
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const plano = params.get("plano") ?? "";
  const [busca, setBusca] = useState(q);
  const [buscaPlano, setBuscaPlano] = useState(plano);
  const situacaoParam = params.get("situacao") as Situacao | null;
  const consulta: ConsultaEquipes = {
    q: q || undefined,
    plano: plano || undefined,
    area_id: idPositivo(params.get("area_id")),
    situacao: situacaoParam && SITUACOES.includes(situacaoParam) ? situacaoParam : undefined,
    page: Math.max(1, Number(params.get("page")) || 1),
    page_size: TAMANHOS.includes(Number(params.get("page_size"))) ? Number(params.get("page_size")) : 20,
  };
  const [excluindo, setExcluindo] = useState<EquipeItem | null>(null);
  const situacao = useSituacaoEquipe();

  const atualizar = (mudancas: Record<string, string | null>, manterPagina = false) =>
    setParams(
      (atual) => {
        const p = new URLSearchParams(atual);
        for (const [k, v] of Object.entries(mudancas)) {
          if (v) p.set(k, v);
          else p.delete(k);
        }
        if (!manterPagina) p.delete("page");
        return p;
      },
      { replace: true },
    );

  // Buscas com pequena espera, para não consultar a cada tecla.
  useEffect(() => {
    const t = setTimeout(() => {
      if (busca !== q || buscaPlano !== plano) atualizar({ q: busca.trim() || null, plano: buscaPlano.trim() || null });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca, buscaPlano]);

  const lista = useEquipes(consulta);
  const areas = useOpcoesPlanos().data?.areas ?? [];
  const dados = lista.data;
  const filtrando = !!(consulta.q || consulta.plano || consulta.area_id || consulta.situacao);

  return (
    <div className={styles.pagina}>
      <header className={styles.cabecalho}>
        <div>
          <h1 className={styles.titulo}>Equipes</h1>
          <p className={styles.subtitulo}>
            Equipes de trabalho de cada plano de ação, com participantes de áreas e funções diferentes e um coordenador. Você vê
            as equipes dos planos que gerencia e as equipes das quais participa. A equipe não substitui o gestor do plano nem os
            responsáveis pelas ações, e participar dela não gera pontos na gamificação.
          </p>
        </div>
        {podeCriar && (
          <ButtonLink to="/equipes/nova" variante="primaria">
            + Nova equipe
          </ButtonLink>
        )}
      </header>

      <div className={styles.barra}>
        <label className={styles.filtro}>
          Equipe
          <Input compacto type="search" placeholder="Nome da equipe" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
        <label className={styles.filtro}>
          Plano
          <Input compacto type="search" placeholder="Código ou nome do plano" value={buscaPlano} onChange={(e) => setBuscaPlano(e.target.value)} />
        </label>
        <label className={styles.filtro}>
          Área
          <Select compacto value={consulta.area_id ?? ""} onChange={(e) => atualizar({ area_id: e.target.value || null })}>
            <option value="">Todas</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </Select>
        </label>
        <label className={styles.filtro}>
          Situação
          <Select compacto value={consulta.situacao ?? ""} onChange={(e) => atualizar({ situacao: e.target.value || null })}>
            <option value="">Todas</option>
            <option value="ativas">Ativas</option>
            <option value="inativas">Inativas</option>
            <option value="sem_plano">Sem plano vinculado</option>
          </Select>
        </label>
      </div>

      {situacao.error && <p className={styles.erro}>{situacao.error.message}</p>}
      <Card semPadding>
        {lista.error ? (
          <p className={styles.erro}>Não foi possível carregar: {lista.error.message}</p>
        ) : !dados ? (
          <p className={styles.estado}>Carregando…</p>
        ) : dados.items.length === 0 ? (
          <p className={styles.estado}>{filtrando ? "Nenhuma equipe com esses filtros." : "Nenhuma equipe para exibir."}</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <th scope="col">Equipe</th>
                <th scope="col" className={estilos.colSecundaria}>
                  Plano
                </th>
                <th scope="col" className={estilos.colSecundaria}>
                  Área
                </th>
                <th scope="col" className={estilos.colSecundaria}>
                  Coordenador
                </th>
                <th scope="col" data-numerico className={estilos.colSecundaria}>
                  Participantes
                </th>
                <th scope="col">Situação</th>
                <th scope="col" data-acoes>
                  Operações
                </th>
              </tr>
            </thead>
            <tbody>
              {dados.items.map((e) => (
                <tr key={e.id} data-inativo={e.ativo ? undefined : true}>
                  <td>
                    <Link to={`/equipes/${e.id}`} className={estilos.nome}>
                      {e.nome}
                    </Link>
                    {/* Celular: as colunas secundárias vêm aqui, embaixo do nome. */}
                    <span className={`${styles.meta} ${estilos.metaCelular}`}>
                      {e.plano ? e.plano.codigo : "Sem plano vinculado"}
                      <br />
                      {e.area.nome} · {e.total_participantes} participante{e.total_participantes === 1 ? "" : "s"}
                      <br />
                      Coordenador: {e.coordenador.nome}
                    </span>
                  </td>
                  <td className={estilos.colSecundaria}>
                    {e.plano ? (
                      <>
                        <span className={estilos.codigo}>{e.plano.codigo}</span>
                        <span className={styles.meta}>{e.plano.nome}</span>
                      </>
                    ) : (
                      <span className={styles.meta}>Sem plano vinculado</span>
                    )}
                  </td>
                  <td className={estilos.colSecundaria}>{e.area.nome}</td>
                  <td className={estilos.colSecundaria}>{e.coordenador.nome}</td>
                  <td data-numerico className={estilos.colSecundaria}>
                    {e.total_participantes}
                  </td>
                  <td>
                    <SelosEquipe equipe={e} />
                  </td>
                  <td data-acoes>
                    <div className={styles.acoesLinha}>
                      <ButtonLink to={`/equipes/${e.id}`} variante="link">
                        Visualizar
                      </ButtonLink>
                      {e.pode_gerenciar && (
                        <DropdownMenu
                          rotulo={<Icon name="more" size={16} strokeWidth={2.6} />}
                          ariaLabel={`Operações: ${e.nome}`}
                          classeBotao={classesDoBotao({ variante: "icone", tamanho: "sm" })}
                        >
                          {(fechar) => (
                            <>
                              <DropdownItem onClick={() => (fechar(), navigate(`/equipes/${e.id}/editar`))}>Editar</DropdownItem>
                              <DropdownItem disabled={situacao.isPending} onClick={() => (fechar(), situacao.mutate({ id: e.id, ativo: !e.ativo }))}>
                                {e.ativo ? "Inativar" : "Ativar"}
                              </DropdownItem>
                              <DropdownItem perigo onClick={() => (fechar(), setExcluindo(e))}>
                                Excluir
                              </DropdownItem>
                            </>
                          )}
                        </DropdownMenu>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {dados && dados.total > 0 && (
        <Pagination
          pagina={consulta.page!}
          tamanho={consulta.page_size!}
          total={dados.total}
          tamanhos={TAMANHOS}
          onPagina={(p) => atualizar({ page: String(p) }, true)}
          onTamanho={(t) => atualizar({ page_size: String(t) })}
        />
      )}

      <ModalExcluirEquipe equipe={excluindo} onFechar={() => setExcluindo(null)} />
    </div>
  );
}
