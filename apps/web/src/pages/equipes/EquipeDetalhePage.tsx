import { ApiError, type PeriodoEquipe } from "@planogestao/api-client";
import type { EquipeItem, MembroEquipe, OrdenacaoPlano, TipoPeriodo, UsuarioOpcao } from "@planogestao/shared-types";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import styles from "../../components/admin/Admin.module.css";
import estilos from "../../components/equipes/Equipes.module.css";
import { ContextoFonteIndicadores, FONTES_INDICADORES_EQUIPE } from "../../components/indicadores/fontesIndicadores";
import { PainelWidgets } from "../../components/painel/PainelWidgets";
import { COLUNAS_PADRAO, COLUNAS_PLANOS } from "../../components/planos/colunasPlanos";
import { TabelaPlanos } from "../../components/planos/TabelaPlanos";
import { Avatar } from "../../components/ui/Avatar";
import { Badge } from "../../components/ui/Badge";
import { Button, ButtonLink } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Icon } from "../../components/ui/Icon";
import { Input } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { Pagination } from "../../components/ui/Pagination";
import { Select } from "../../components/ui/Select";
import { Table } from "../../components/ui/Table";
import { Tabs } from "../../components/ui/Tabs";
import { UserPicker } from "../../components/ui/UserPicker";
import {
  useAdicionarMembros,
  useAtualizarMembro,
  useEquipe,
  useExcluirEquipe,
  useIndicadoresEquipe,
  useMembrosEquipe,
  useRemoverMembro,
} from "../../hooks/useEquipes";
import { usePainel } from "../../hooks/usePainel";
import { usePlanos } from "../../hooks/usePlanos";
import { temPermissao, useAuthStore } from "../../store/authStore";
import { formatarData } from "../../utils/datas";
import { ROTULO_PERIODO } from "../../utils/rotulos";

type Aba = "membros" | "planos" | "indicadores";
const ABAS: Aba[] = ["membros", "planos", "indicadores"];
const PERIODOS: TipoPeriodo[] = (Object.keys(ROTULO_PERIODO) as TipoPeriodo[]).filter((p) => p !== "personalizado");

export function EquipeDetalhePage() {
  const navigate = useNavigate();
  const equipeId = Number(useParams().id);
  const [params, setParams] = useSearchParams();
  const aba: Aba = ABAS.includes(params.get("aba") as Aba) ? (params.get("aba") as Aba) : "membros";
  const usuario = useAuthStore((s) => s.usuario);
  const podeGerenciar = temPermissao(usuario, "equipes:gerenciar");
  const equipe = useEquipe(equipeId);
  const membros = useMembrosEquipe(equipeId);
  const excluir = useExcluirEquipe();
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);

  if (equipe.error instanceof ApiError && equipe.error.status === 404) {
    return (
      <div className={styles.pagina}>
        <h1 className={styles.titulo}>Equipe não encontrada</h1>
        <p className={styles.subtitulo}>
          Ela pode ter sido excluída. <Link to="/equipes">Voltar para Equipes</Link>
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
            <Badge tom={e.ativo ? "sucesso" : "neutro"}>{e.ativo ? "Ativa" : "Inativa"}</Badge>
          </div>
          <p className={estilos.dados}>
            <span>
              Área <strong>{e.area.nome}</strong>
              {e.setor && (
                <>
                  {" "}
                  · função/cargo <strong>{e.setor.nome}</strong>
                </>
              )}
            </span>
            <span>
              Supervisor <strong>{e.supervisor.nome}</strong>
            </span>
          </p>
          {e.descricao && <p className={styles.subtitulo}>{e.descricao}</p>}
        </div>
        {podeGerenciar && (
          <div className={styles.barra}>
            <Button variante="perigo" onClick={() => setConfirmarExclusao(true)}>
              Excluir
            </Button>
            <ButtonLink to={`/equipes/${e.id}/editar`} variante="primaria">
              Editar
            </ButtonLink>
          </div>
        )}
      </header>

      <Tabs<Aba>
        rotulo="Seções da equipe"
        ativa={aba}
        onSelecionar={irPara}
        abas={[
          { id: "membros", rotulo: "Membros", contador: membros.data?.length },
          { id: "planos", rotulo: "Planos" },
          { id: "indicadores", rotulo: "Indicadores" },
        ]}
      >
        {aba === "membros" && <AbaMembros equipe={e} membros={membros.data} carregando={membros.isLoading} erro={membros.error} podeGerenciar={podeGerenciar} />}
        {aba === "planos" && <AbaPlanos equipeId={e.id} semMembros={membros.data?.length === 0} />}
        {aba === "indicadores" && <AbaIndicadores equipeId={e.id} />}
      </Tabs>

      <Modal
        aberto={confirmarExclusao}
        titulo="Excluir equipe"
        onFechar={() => setConfirmarExclusao(false)}
        acoes={
          <>
            <Button onClick={() => setConfirmarExclusao(false)}>Cancelar</Button>
            <Button variante="perigo" disabled={excluir.isPending} onClick={() => excluir.mutate(e.id, { onSuccess: () => navigate("/equipes", { replace: true }) })}>
              {excluir.isPending ? "Excluindo…" : "Excluir definitivamente"}
            </Button>
          </>
        }
      >
        {excluir.error && <p className={styles.erro}>{excluir.error.message}</p>}
        <p>
          Excluir a equipe “{e.nome}”? Os membros saem dela, mas nada muda nos planos, ações e pontos das pessoas — eles são
          de cada usuário, não da equipe. Para só tirar a equipe dos filtros, edite e marque como inativa.
        </p>
      </Modal>
    </div>
  );
}

// ---- Membros ------------------------------------------------------------------------------------

function AbaMembros({
  equipe,
  membros,
  carregando,
  erro,
  podeGerenciar,
}: {
  equipe: EquipeItem;
  membros: MembroEquipe[] | undefined;
  carregando: boolean;
  erro: Error | null;
  podeGerenciar: boolean;
}) {
  const [escolhido, setEscolhido] = useState<UsuarioOpcao | null>(null);
  const [fila, setFila] = useState<UsuarioOpcao[]>([]);
  const [papel, setPapel] = useState("");
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [removendo, setRemovendo] = useState<MembroEquipe | null>(null);
  const [editando, setEditando] = useState<{ membro: MembroEquipe; papel: string } | null>(null);
  const adicionar = useAdicionarMembros(equipe.id);
  const remover = useRemoverMembro(equipe.id);
  const atualizar = useAtualizarMembro(equipe.id);
  const jaMembros = new Set(membros?.map((m) => m.usuario_id));

  // Escolher no campo de busca coloca na fila; "Adicionar" envia todos de uma vez (POST com vários ids).
  const enfileirar = (u: UsuarioOpcao | null) => {
    setEscolhido(null);
    setMensagem(null);
    if (!u || fila.some((f) => f.id === u.id)) return;
    if (jaMembros.has(u.id)) return setMensagem(`${u.nome} já é membro da equipe.`);
    setFila((f) => [...f, u]);
  };

  const enviar = () =>
    adicionar.mutate(
      { usuario_ids: fila.map((u) => u.id), papel_na_equipe: papel.trim() || null },
      {
        onSuccess: (r) => {
          setMensagem(
            `${r.adicionados.length} membro(s) adicionado(s).${r.ja_membros.length ? ` ${r.ja_membros.length} já estava(m) na equipe.` : ""}`,
          );
          setFila([]);
          setPapel("");
        },
      },
    );

  return (
    <Card semPadding>
      {podeGerenciar && (
        <div className={estilos.adicionar}>
          <label className={styles.filtro}>
            Adicionar membros
            <UserPicker id="membro-busca" ariaLabel="Buscar usuário para adicionar" valor={escolhido} onSelecionar={enfileirar} />
          </label>
          <label className={styles.filtro}>
            Papel na equipe (opcional)
            <Input compacto maxLength={60} placeholder="Ex.: Operador, Líder de turno" value={papel} onChange={(e) => setPapel(e.target.value)} />
          </label>
          <Button variante="primaria" disabled={fila.length === 0 || adicionar.isPending} onClick={enviar}>
            {adicionar.isPending ? "Adicionando…" : fila.length > 1 ? `Adicionar ${fila.length}` : "Adicionar"}
          </Button>
          {fila.length > 0 && (
            <div className={estilos.fila} aria-label="Usuários a adicionar">
              {fila.map((u) => (
                <span key={u.id} className={estilos.chipFila}>
                  {u.nome}
                  <button type="button" aria-label={`Tirar ${u.nome} da lista`} onClick={() => setFila((f) => f.filter((x) => x.id !== u.id))}>
                    <Icon name="x" size={13} />
                  </button>
                </span>
              ))}
            </div>
          )}
          {adicionar.error && <p className={`${styles.erro} ${estilos.fila}`}>{adicionar.error.message}</p>}
          {mensagem && (
            <p className={`${styles.sucesso} ${estilos.fila}`} role="status">
              {mensagem}
            </p>
          )}
        </div>
      )}

      {remover.error && <p className={styles.erro}>{remover.error.message}</p>}
      {erro ? (
        <p className={styles.erro}>Não foi possível carregar os membros: {erro.message}</p>
      ) : carregando || !membros ? (
        <p className={styles.estado}>Carregando…</p>
      ) : membros.length === 0 ? (
        <p className={styles.estado}>Nenhum membro ainda.{podeGerenciar && " Use a busca acima para adicionar."}</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <th scope="col">Membro</th>
              <th scope="col">Papel</th>
              <th scope="col">Área / Função/Cargo</th>
              <th scope="col">Na equipe desde</th>
              {podeGerenciar && (
                <th scope="col" data-acoes>
                  <span className="sr-only">Ações</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {membros.map((m) => (
              <tr key={m.usuario_id} data-inativo={m.ativo ? undefined : true}>
                <td>
                  <div className={estilos.membro}>
                    <Avatar nome={m.nome} url={m.avatar_url} tamanho="sm" />
                    <span>
                      {m.nome}
                      {m.usuario_id === equipe.supervisor.id && " (supervisor)"}
                      {!m.ativo && " · inativo"}
                      <span className={styles.meta}>
                        {m.perfil} · {m.email}
                      </span>
                    </span>
                  </div>
                </td>
                <td>{m.papel_na_equipe ?? <span className={styles.meta}>—</span>}</td>
                <td>
                  {m.area ?? "—"}
                  {m.setor && <span className={styles.meta}>{m.setor}</span>}
                </td>
                <td>{formatarData(m.data_entrada)}</td>
                {podeGerenciar && (
                  <td data-acoes>
                    <div className={styles.acoesLinha}>
                      <Button variante="link" onClick={() => setEditando({ membro: m, papel: m.papel_na_equipe ?? "" })}>
                        Papel
                      </Button>
                      <Button variante="link" className={styles.linkPerigo} onClick={() => setRemovendo(m)}>
                        Remover
                      </Button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <Modal
        aberto={removendo !== null}
        titulo="Remover da equipe"
        onFechar={() => setRemovendo(null)}
        acoes={
          <>
            <Button onClick={() => setRemovendo(null)}>Cancelar</Button>
            <Button
              variante="perigo"
              disabled={remover.isPending}
              onClick={() => removendo && remover.mutate(removendo.usuario_id, { onSettled: () => setRemovendo(null) })}
            >
              {remover.isPending ? "Removendo…" : "Remover"}
            </Button>
          </>
        }
      >
        <p>
          Tirar {removendo?.nome} da equipe “{equipe.nome}”? Os planos, ações e pontos dele continuam como estão; ele só deixa
          de contar nos números desta equipe.
        </p>
      </Modal>

      <Modal
        aberto={editando !== null}
        titulo={`Papel de ${editando?.membro.nome ?? ""}`}
        onFechar={() => setEditando(null)}
        acoes={
          <>
            <Button onClick={() => setEditando(null)}>Cancelar</Button>
            <Button
              variante="primaria"
              disabled={atualizar.isPending}
              onClick={() =>
                editando &&
                atualizar.mutate({ usuarioId: editando.membro.usuario_id, papel: editando.papel.trim() || null }, { onSuccess: () => setEditando(null) })
              }
            >
              {atualizar.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </>
        }
      >
        {atualizar.error && <p className={styles.erro}>{atualizar.error.message}</p>}
        <label className={styles.filtro}>
          Papel na equipe (deixe vazio para remover)
          <Input maxLength={60} value={editando?.papel ?? ""} onChange={(ev) => setEditando((ed) => (ed ? { ...ed, papel: ev.target.value } : ed))} />
        </label>
      </Modal>
    </Card>
  );
}

// ---- Planos: a mesma tabela e o mesmo endpoint da listagem de Planos, filtrados pela equipe ---------

function AbaPlanos({ equipeId, semMembros }: { equipeId: number; semMembros: boolean }) {
  const [ordenar, setOrdenar] = useState<OrdenacaoPlano>("criado_em");
  const [direcao, setDirecao] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const lista = usePlanos({ equipe_id: equipeId, ordenar, direcao, page, page_size: pageSize });
  const colunas = useMemo(() => COLUNAS_PLANOS.filter((c) => c.fixa || COLUNAS_PADRAO.includes(c.id)), []);

  const ordenarPor = (campo: OrdenacaoPlano) => {
    setDirecao(ordenar === campo && direcao === "asc" ? "desc" : "asc");
    setOrdenar(campo);
    setPage(1);
  };

  if (semMembros) return <p className={styles.estado}>A equipe ainda não tem membros: os planos listados aqui são os que têm um membro como responsável.</p>;
  return (
    <>
      <div className={estilos.barraAba}>
        <p className={styles.meta}>
          Planos cujo responsável é membro da equipe (visíveis para você){lista.data ? ` · ${lista.data.total} plano(s)` : ""}.
        </p>
      </div>
      {lista.error ? (
        <p className={styles.erro}>Não foi possível carregar os planos: {lista.error.message}</p>
      ) : !lista.data ? (
        <p className={styles.estado}>Carregando…</p>
      ) : lista.data.total === 0 ? (
        <p className={styles.estado}>Nenhum plano com responsável desta equipe.</p>
      ) : (
        <>
          <TabelaPlanos planos={lista.data.items} colunas={colunas} ordenar={ordenar} direcao={direcao} onOrdenar={ordenarPor} />
          <Pagination
            pagina={page}
            tamanho={pageSize}
            total={lista.data.total}
            tamanhos={[20, 50, 100]}
            onPagina={setPage}
            onTamanho={(t) => {
              setPageSize(t);
              setPage(1);
            }}
          />
        </>
      )}
    </>
  );
}

// ---- Indicadores: componentes da Fase 9 com o endpoint agregado da equipe -----------------------------

function AbaIndicadores({ equipeId }: { equipeId: number }) {
  const [periodo, setPeriodo] = useState<TipoPeriodo>("ano");
  const filtro: PeriodoEquipe = useMemo(() => ({ periodo }), [periodo]);
  const q = useIndicadoresEquipe(equipeId, filtro);
  const d = q.data;
  const painel = usePainel("indicadores");
  const contexto = useMemo(
    () => ({
      filtros: { periodo },
      agregado: { data: d, isLoading: q.isLoading, isFetching: q.isFetching, error: q.error },
      mensagemSemPendencias: "Nenhuma ação em aberto com responsável desta equipe.",
    }),
    [periodo, d, q.isLoading, q.isFetching, q.error],
  );

  return (
    <>
      <div className={estilos.barraAba}>
        <p className={styles.meta}>
          Planos cujo responsável é membro e ações cujo responsável é membro, dos planos criados no período.
          {d && ` ${d.membros} membro(s).`}
          {q.isFetching && !q.isLoading && " Atualizando…"}
        </p>
        <label className={styles.filtro}>
          Período
          <Select compacto value={periodo} onChange={(e) => setPeriodo(e.target.value as TipoPeriodo)}>
            {PERIODOS.map((p) => (
              <option key={p} value={p}>
                {ROTULO_PERIODO[p]}
              </option>
            ))}
          </Select>
        </label>
      </div>
      {/* O painel de Indicadores do próprio usuário (mesmo layout), só leitura, com o endpoint agregado da equipe. */}
      <ContextoFonteIndicadores.Provider value={contexto}>
        <PainelWidgets painel={painel} fontes={FONTES_INDICADORES_EQUIPE} somenteLeitura />
      </ContextoFonteIndicadores.Provider>
    </>
  );
}
