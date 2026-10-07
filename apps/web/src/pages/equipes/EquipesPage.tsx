import type { ConsultaEquipes } from "@planogestao/api-client";
import type { EquipeItem } from "@planogestao/shared-types";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import styles from "../../components/admin/Admin.module.css";
import estilos from "../../components/equipes/Equipes.module.css";
import { ArvoreEquipes } from "../../components/equipes/ArvoreEquipes";
import { ModalExcluirEquipe } from "../../components/equipes/ModalExcluirEquipe";
import { SelosEquipe } from "../../components/equipes/SelosEquipe";
import { ButtonLink, classesDoBotao } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Pagination } from "../../components/ui/Pagination";
import { Select } from "../../components/ui/Select";
import { Table } from "../../components/ui/Table";
import { DropdownItem, DropdownMenu } from "../../components/ui/DropdownMenu";
import { Icon } from "../../components/ui/Icon";
import { useArvoreEquipes, useEquipes, useSituacaoEquipe } from "../../hooks/useEquipes";
import { useOpcoesPlanos } from "../../hooks/usePlanos";
import { temPermissao, useAuthStore } from "../../store/authStore";

const TAMANHOS = [20, 50, 100];
const SITUACOES = ["ativas", "inativas", "sem_plano"] as const;
type Situacao = (typeof SITUACOES)[number];
const PLANOS = ["ativos", "arquivados"] as const;
type FiltroPlanos = (typeof PLANOS)[number];
type Vista = "lista" | "arvore";
const idPositivo = (v: string | null) => (v && Number(v) > 0 ? Number(v) : undefined);

export function EquipesPage() {
  const navigate = useNavigate();
  const usuario = useAuthStore((s) => s.usuario);
  const podeCriar = temPermissao(usuario, "equipes:gerenciar");
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const plano = params.get("plano") ?? "";
  const participante = params.get("participante") ?? "";
  const vista: Vista = params.get("vista") === "arvore" ? "arvore" : "lista";
  const [busca, setBusca] = useState(q);
  const [buscaPlano, setBuscaPlano] = useState(plano);
  const [buscaParticipante, setBuscaParticipante] = useState(participante);
  const situacaoParam = params.get("situacao") as Situacao | null;
  const planosParam = params.get("planos") as FiltroPlanos | null;
  // Os mesmos filtros nas duas visualizações (a Árvore não pagina).
  const filtros: Omit<ConsultaEquipes, "page" | "page_size"> = {
    q: q || undefined,
    plano: plano || undefined,
    participante: participante || undefined,
    area_id: idPositivo(params.get("area_id")),
    situacao: situacaoParam && SITUACOES.includes(situacaoParam) ? situacaoParam : undefined,
    planos: planosParam && PLANOS.includes(planosParam) ? planosParam : undefined,
  };
  const consulta: ConsultaEquipes = {
    ...filtros,
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
      if (busca !== q || buscaPlano !== plano || buscaParticipante !== participante)
        atualizar({
          q: busca.trim() || null,
          plano: buscaPlano.trim() || null,
          participante: buscaParticipante.trim() || null,
        });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca, buscaPlano, buscaParticipante]);

  const lista = useEquipes(consulta, vista === "lista");
  const arvore = useArvoreEquipes(filtros, vista === "arvore");
  const areas = useOpcoesPlanos().data?.areas ?? [];
  const dados = lista.data;
  const filtrando = Object.values(filtros).some((v) => v !== undefined);

  return (
    <div className={styles.pagina}>
      <header className={styles.cabecalho}>
        <div>
          <h1 className={styles.titulo}>Equipes</h1>
          <p className={styles.subtitulo}>
            Equipes de trabalho de cada plano de ação, com participantes de áreas e funções diferentes e um coordenador. Você vê as equipes
            dos planos que gerencia e as equipes das quais participa. A equipe não substitui o gestor do plano nem os responsáveis pelas
            ações, e participar dela não gera pontos na gamificação.
          </p>
        </div>
        {podeCriar && (
          <ButtonLink to="/equipes/nova" variante="primaria">
            + Nova equipe
          </ButtonLink>
        )}
      </header>

      <div className={estilos.barraVista}>
        <div className={estilos.grupoBotoes} role="group" aria-label="Visualização">
          {(["lista", "arvore"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={vista === v}
              className={vista === v ? `${estilos.alternador} ${estilos.alternadorAtivo}` : estilos.alternador}
              onClick={() => atualizar({ vista: v === "arvore" ? "arvore" : null }, true)}
            >
              {v === "lista" ? "Lista" : "Árvore"}
            </button>
          ))}
        </div>
        {vista === "arvore" && <span className={styles.meta}>Plano de ação → equipes → composição (coordenador e participantes).</span>}
      </div>

      <div className={styles.barra}>
        <label className={styles.filtro}>
          Equipe
          <Input compacto type="search" placeholder="Nome da equipe" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
        <label className={styles.filtro}>
          Plano
          <Input
            compacto
            type="search"
            placeholder="Código ou nome do plano"
            value={buscaPlano}
            onChange={(e) => setBuscaPlano(e.target.value)}
          />
        </label>
        <label className={styles.filtro}>
          Participante
          <Input
            compacto
            type="search"
            placeholder="Nome ou e-mail"
            value={buscaParticipante}
            onChange={(e) => setBuscaParticipante(e.target.value)}
          />
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
        <label className={styles.filtro}>
          Planos
          <Select compacto value={filtros.planos ?? ""} onChange={(e) => atualizar({ planos: e.target.value || null })}>
            <option value="">Ativos e arquivados</option>
            <option value="ativos">Somente ativos</option>
            <option value="arquivados">Somente arquivados</option>
          </Select>
        </label>
      </div>

      {vista === "arvore" ? (
        arvore.error ? (
          <p className={styles.erro}>Não foi possível carregar: {arvore.error.message}</p>
        ) : !arvore.data ? (
          <p className={styles.estado}>Carregando…</p>
        ) : arvore.data.planos.length === 0 ? (
          <Card semPadding>
            <p className={styles.estado}>{filtrando ? "Nenhuma equipe com esses filtros." : "Nenhuma equipe para exibir."}</p>
          </Card>
        ) : (
          <ArvoreEquipes dados={arvore.data} buscaParticipante={!!filtros.participante} />
        )
      ) : (
        <>
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
                          {e.area.nome} · {e.total_participantes} participante
                          {e.total_participantes === 1 ? "" : "s"}
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
                              classeBotao={classesDoBotao({
                                variante: "icone",
                                tamanho: "sm",
                              })}
                            >
                              {(fechar) => (
                                <>
                                  <DropdownItem onClick={() => (fechar(), navigate(`/equipes/${e.id}/editar`))}>Editar</DropdownItem>
                                  <DropdownItem
                                    disabled={situacao.isPending}
                                    onClick={() => (
                                      fechar(),
                                      situacao.mutate({
                                        id: e.id,
                                        ativo: !e.ativo,
                                      })
                                    )}
                                  >
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
        </>
      )}
    </div>
  );
}
