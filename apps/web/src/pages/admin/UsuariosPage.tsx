import type { UsuarioAdminItem, UsuarioAtualizar } from "@planogestao/shared-types";
import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";

import styles from "../../components/admin/Admin.module.css";
import { AreasAutorizadas, type SelecaoAreas } from "../../components/admin/AreasAutorizadas";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Field, fieldAria } from "../../components/ui/Field";
import { Checkbox, Input } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { Pagination } from "../../components/ui/Pagination";
import { Select } from "../../components/ui/Select";
import { Table } from "../../components/ui/Table";
import { useAreasAdmin, useMutacaoAdmin, usePendenciasAreas, usePerfisAdmin, useSetoresAdmin, useUsuariosAdmin } from "../../hooks/useAdministracao";
import { api } from "../../services/api";
import { useAuthStore } from "../../store/authStore";
import { formatarDataHora } from "../../utils/datas";

const TAMANHOS = [20, 50, 100];
const idPositivo = (v: string | null) => (v && Number(v) > 0 ? Number(v) : undefined);

interface Form {
  nome: string;
  email: string;
  perfil_id: string;
  area_id: string;
  setor_id: string;
  /** Acesso a planos por área (separado da lotação acima). */
  acesso: SelecaoAreas;
  ativo: boolean;
  senha: string;
}

type Erros = Partial<Record<keyof Form, string>>;

const PERFIL_ADMINISTRADOR = "Administrador";
const vazio: Form = { nome: "", email: "", perfil_id: "", area_id: "", setor_id: "", acesso: { todas: false, ids: [] }, ativo: true, senha: "" };

function validar(f: Form, criando: boolean): Erros {
  const e: Erros = {};
  if (f.nome.trim().split(/\s+/).join(" ").length < 3) e.nome = "Informe o nome completo.";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) e.email = "E-mail inválido.";
  if (!f.perfil_id) e.perfil_id = "Selecione o perfil.";
  if (f.setor_id && !f.area_id) e.setor_id = "Selecione a área do setor.";
  if (criando && !f.senha) e.senha = "Informe a senha inicial.";
  if (f.senha && (f.senha.length < 8 || !/[A-Za-z]/.test(f.senha) || !/\d/.test(f.senha)))
    e.senha = "Mínimo de 8 caracteres, com letras e números.";
  return e;
}

export function UsuariosPage() {
  const [params, setParams] = useSearchParams();
  const eu = useAuthStore((s) => s.usuario);
  const q = params.get("q") ?? "";
  const [busca, setBusca] = useState(q);
  const ativoParam = params.get("ativo");
  const consulta = {
    q: q || undefined,
    perfil_id: idPositivo(params.get("perfil_id")),
    area_id: idPositivo(params.get("area_id")),
    ativo: ativoParam === "1" ? true : ativoParam === "0" ? false : undefined,
    page: Math.max(1, Number(params.get("page")) || 1),
    page_size: TAMANHOS.includes(Number(params.get("page_size"))) ? Number(params.get("page_size")) : 20,
  };

  const lista = useUsuariosAdmin(consulta);
  const perfis = usePerfisAdmin();
  const areas = useAreasAdmin();
  const setores = useSetoresAdmin();
  const pendencias = usePendenciasAreas();

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

  // Busca com pequena espera, para não consultar a cada tecla.
  useEffect(() => {
    const t = setTimeout(() => busca !== q && atualizar({ q: busca.trim() || null }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);

  const [editando, setEditando] = useState<UsuarioAdminItem | "novo" | null>(null);
  const [form, setForm] = useState<Form>(vazio);
  const [erros, setErros] = useState<Erros>({});
  const [inativando, setInativando] = useState<UsuarioAdminItem | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  // Na criação, a lotação é sugerida como área autorizada até o Administrador mexer na seleção.
  const [acessoTocado, setAcessoTocado] = useState(false);

  const criando = editando === "novo";
  const proprio = !criando && editando !== null && editando.id === eu?.id;

  const salvar = useMutacaoAdmin(async ({ id, f }: { id: number | null; f: Form }) => {
    const base = {
      nome: f.nome.trim(),
      email: f.email.trim(),
      perfil_id: Number(f.perfil_id),
      area_id: f.area_id ? Number(f.area_id) : null,
      setor_id: f.setor_id ? Number(f.setor_id) : null,
      ativo: f.ativo,
      // A foto não é enviada: a já armazenada (ou a do Meu Perfil) é mantida.
      todas_areas: f.acesso.todas,
      areas_autorizadas: f.acesso.ids,
    };
    return id ? api.admin.usuarios.atualizar(id, { ...base, nova_senha: f.senha || null }) : api.admin.usuarios.criar({ ...base, senha: f.senha });
  });
  const inativar = useMutacaoAdmin((id: number) => api.admin.usuarios.inativar(id));
  const reativar = useMutacaoAdmin((u: UsuarioAdminItem) => {
    const corpo: UsuarioAtualizar = {
      nome: u.nome, email: u.email, perfil_id: u.perfil.id, area_id: u.area?.id ?? null, setor_id: u.setor?.id ?? null,
      ativo: true,
    };
    return api.admin.usuarios.atualizar(u.id, corpo);
  });

  const abrir = (u: UsuarioAdminItem | null) => {
    setEditando(u ?? "novo");
    setForm(
      u
        ? {
            nome: u.nome, email: u.email, perfil_id: String(u.perfil.id), area_id: String(u.area?.id ?? ""), setor_id: String(u.setor?.id ?? ""),
            // Edição: os vínculos salvos, nunca recalculados pela lotação.
            acesso: { todas: u.todas_areas, ids: u.areas_autorizadas.map((a) => a.id) },
            ativo: u.ativo, senha: "",
          }
        : vazio,
    );
    setAcessoTocado(false);
    setErros({});
    salvar.reset();
  };

  const mudar = <K extends keyof Form>(campo: K, valor: Form[K]) => {
    setErros((e) => ({ ...e, [campo]: undefined }));
    setForm((f) => {
      const novo = { ...f, [campo]: valor, ...(campo === "area_id" ? { setor_id: "" } : {}) };
      if (campo === "area_id" && criando && !acessoTocado) novo.acesso = { todas: false, ids: valor ? [Number(valor)] : [] };
      return novo;
    });
  };

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const encontrados = validar(form, criando);
    setErros(encontrados);
    if (Object.keys(encontrados).length) return;
    salvar.mutate(
      { id: criando || !editando ? null : editando.id, f: form },
      {
        onSuccess: (u) => {
          setMensagem(`Usuário “${u.nome}” ${criando ? "criado" : "atualizado"}.${form.senha && !criando ? " Senha redefinida; as sessões dele foram encerradas." : ""}`);
          setEditando(null);
        },
      },
    );
  };

  const perfilEscolhido = perfis.data?.find((p) => String(p.id) === form.perfil_id);
  const acessoAutomatico = perfilEscolhido?.nome === PERFIL_ADMINISTRADOR;
  const ajudaAcesso = acessoAutomatico
    ? undefined
    : !form.acesso.todas && form.acesso.ids.length === 0
      ? "Sem área autorizada, o usuário não vê nenhum plano."
      : perfilEscolhido && !perfilEscolhido.permissoes.includes("planos:ver_todos")
        ? "Com este perfil, vê só os planos em que participa, dentro destas áreas."
        : "Vê os planos destas áreas. A lotação acima não dá acesso por si só.";
  const totalPendencias = (pendencias.data?.sem_area.length ?? 0) + (pendencias.data?.atribuicoes.length ?? 0);

  const setoresDaArea = (setores.data ?? []).filter((s) => String(s.area_id) === form.area_id && (s.ativo || String(s.id) === form.setor_id));
  const dados = lista.data;

  return (
    <div className={styles.pagina}>
      <header className={styles.cabecalho}>
        <div>
          <h1 className={styles.titulo}>Usuários</h1>
          <p className={styles.subtitulo}>
            Usuários não são apagados, porque planos e históricos apontam para eles: inativar bloqueia o acesso na hora e
            encerra as sessões.
          </p>
        </div>
        <Button variante="primaria" onClick={() => abrir(null)}>
          + Novo usuário
        </Button>
      </header>

      <div className={styles.barra}>
        <label className={styles.filtro}>
          Buscar
          <Input compacto type="search" placeholder="Nome ou e-mail" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
        <label className={styles.filtro}>
          Perfil
          <Select compacto value={consulta.perfil_id ?? ""} onChange={(e) => atualizar({ perfil_id: e.target.value || null })}>
            <option value="">Todos</option>
            {perfis.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </Select>
        </label>
        <label className={styles.filtro}>
          Área
          <Select compacto value={consulta.area_id ?? ""} onChange={(e) => atualizar({ area_id: e.target.value || null })}>
            <option value="">Todas</option>
            {areas.data?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </Select>
        </label>
        <label className={styles.filtro}>
          Situação
          <Select compacto value={ativoParam ?? ""} onChange={(e) => atualizar({ ativo: e.target.value || null })}>
            <option value="">Todos</option>
            <option value="1">Ativos</option>
            <option value="0">Inativos</option>
          </Select>
        </label>
      </div>

      {mensagem && (
        <p className={styles.sucesso} role="status">
          {mensagem}
        </p>
      )}
      {totalPendencias > 0 && pendencias.data && (
        <details className={styles.pendencias}>
          <summary>{totalPendencias} pendência(s) de acesso por área para regularizar</summary>
          {pendencias.data.sem_area.length > 0 && (
            <>
              <p className={styles.meta}>Usuários ativos sem área autorizada (não veem nenhum plano):</p>
              <ul>
                {pendencias.data.sem_area.map((u) => (
                  <li key={u.id}>
                    {u.nome} · {u.perfil}
                    {u.area ? ` · lotação ${u.area}` : " · sem lotação"}
                  </li>
                ))}
              </ul>
            </>
          )}
          {pendencias.data.atribuicoes.length > 0 && (
            <>
              <p className={styles.meta}>Responsáveis em planos de áreas não autorizadas (não conseguem abrir o item):</p>
              <ul>
                {pendencias.data.atribuicoes.map((a, i) => (
                  <li key={i}>
                    {a.usuario.nome} — {a.papel} em {a.plano_codigo}
                    {a.acao ? ` (${a.acao})` : ""} · área do plano: {a.plano_area}
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className={styles.meta}>Ajuste as áreas autorizadas do usuário (Editar) ou troque o responsável no plano.</p>
        </details>
      )}
      {(inativar.error || reativar.error) && <p className={styles.erro}>{(inativar.error ?? reativar.error)!.message}</p>}

      <Card semPadding>
        {lista.error ? (
          <p className={styles.erro}>Não foi possível carregar: {lista.error.message}</p>
        ) : !dados ? (
          <p className={styles.estado}>Carregando…</p>
        ) : dados.items.length === 0 ? (
          <p className={styles.estado}>Nenhum usuário com esses filtros.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <th scope="col">Nome</th>
                <th scope="col">Perfil</th>
                <th scope="col">Área / setor</th>
                <th scope="col">Último acesso</th>
                <th scope="col">Situação</th>
                <th scope="col" data-acoes>
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {dados.items.map((u) => (
                <tr key={u.id} data-inativo={u.ativo ? undefined : true}>
                  <td>
                    {u.nome}
                    {u.id === eu?.id && " (você)"}
                    <span className={styles.meta}>{u.email}</span>
                  </td>
                  <td>{u.perfil.nome}</td>
                  <td>
                    {u.area?.nome ?? "—"}
                    {u.setor && <span className={styles.meta}>{u.setor.nome}</span>}
                    {(u.acesso_automatico || u.todas_areas || u.areas_autorizadas.length > 0) && (
                      <span className={styles.meta}>
                        {u.acesso_automatico
                          ? "Acesso: todas as áreas (automático)"
                          : u.todas_areas
                            ? "Acesso: todas as áreas"
                            : `Acesso: ${u.areas_autorizadas.map((a) => a.nome).join(", ")}`}
                      </span>
                    )}
                    {u.sem_areas_autorizadas && (
                      <Badge tom="aviso" tamanho="sm">
                        Sem área autorizada
                      </Badge>
                    )}
                  </td>
                  <td>{u.ultimo_login_em ? formatarDataHora(u.ultimo_login_em) : "Nunca"}</td>
                  <td>
                    {u.convite_pendente ? (
                      <Badge tom="aviso">Convite pendente</Badge>
                    ) : (
                      <Badge tom={u.ativo ? "sucesso" : "neutro"}>{u.ativo ? "Ativo" : "Inativo"}</Badge>
                    )}
                  </td>
                  <td data-acoes>
                    <div className={styles.acoesLinha}>
                      <Button variante="link" onClick={() => abrir(u)}>
                        Editar
                      </Button>
                      {u.ativo ? (
                        u.id !== eu?.id && (
                          <Button
                            variante="link"
                            className={styles.linkPerigo}
                            onClick={() => {
                              inativar.reset();
                              setInativando(u);
                            }}
                          >
                            Inativar
                          </Button>
                        )
                      ) : (
                        <Button
                          variante="link"
                          disabled={reativar.isPending}
                          onClick={() => reativar.mutate(u, { onSuccess: () => setMensagem(`“${u.nome}” reativado.`) })}
                        >
                          Reativar
                        </Button>
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
          pagina={consulta.page}
          tamanho={consulta.page_size}
          total={dados.total}
          tamanhos={TAMANHOS}
          onPagina={(p) => atualizar({ page: String(p) }, true)}
          onTamanho={(t) => atualizar({ page_size: String(t) })}
        />
      )}

      <Modal
        aberto={editando !== null}
        titulo={criando ? "Novo usuário" : "Editar usuário"}
        onFechar={() => setEditando(null)}
        acoes={
          <>
            <Button onClick={() => setEditando(null)}>Cancelar</Button>
            <Button type="submit" form="form-usuario" variante="primaria" disabled={salvar.isPending}>
              {salvar.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </>
        }
      >
        <form id="form-usuario" className={styles.form} onSubmit={enviar} noValidate>
          {salvar.error && <p className={`${styles.erro} ${styles.largo}`}>{salvar.error.message}</p>}
          <Field id="u-nome" rotulo="Nome completo" obrigatorio erro={erros.nome} className={styles.largo}>
            <Input {...fieldAria("u-nome", erros.nome)} value={form.nome} maxLength={150} onChange={(e) => mudar("nome", e.target.value)} />
          </Field>
          <Field id="u-email" rotulo="E-mail" obrigatorio erro={erros.email} className={styles.largo}>
            <Input {...fieldAria("u-email", erros.email)} type="email" autoComplete="off" value={form.email} maxLength={255} onChange={(e) => mudar("email", e.target.value)} />
          </Field>
          <Field id="u-perfil" rotulo="Perfil" obrigatorio erro={erros.perfil_id} ajuda={proprio ? "Você não pode trocar o seu próprio perfil." : undefined}>
            <Select {...fieldAria("u-perfil", erros.perfil_id)} value={form.perfil_id} disabled={proprio} onChange={(e) => mudar("perfil_id", e.target.value)}>
              <option value="">Selecione…</option>
              {perfis.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="u-area" rotulo="Área">
            <Select id="u-area" value={form.area_id} onChange={(e) => mudar("area_id", e.target.value)}>
              <option value="">Sem área</option>
              {areas.data
                ?.filter((a) => a.ativo || String(a.id) === form.area_id)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nome}
                  </option>
                ))}
            </Select>
          </Field>
          <Field id="u-setor" rotulo="Setor" erro={erros.setor_id}>
            <Select {...fieldAria("u-setor", erros.setor_id)} value={form.setor_id} disabled={!form.area_id} onChange={(e) => mudar("setor_id", e.target.value)}>
              <option value="">{form.area_id ? "Sem setor" : "Escolha a área antes"}</option>
              {setoresDaArea.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="u-acesso" rotulo="Áreas autorizadas" ajuda={ajudaAcesso}>
            <AreasAutorizadas
              id="u-acesso"
              areas={areas.data ?? []}
              valor={form.acesso}
              automatico={acessoAutomatico}
              onChange={(acesso) => {
                setAcessoTocado(true);
                mudar("acesso", acesso);
              }}
            />
          </Field>
          <Field
            id="u-senha"
            rotulo={criando ? "Senha inicial" : "Nova senha"}
            obrigatorio={criando}
            erro={erros.senha}
            ajuda={criando ? "Mínimo de 8 caracteres, com letras e números." : "Deixe em branco para manter. Redefinir encerra as sessões do usuário."}
            className={styles.largo}
          >
            <Input {...fieldAria("u-senha", erros.senha)} type="password" autoComplete="new-password" value={form.senha} maxLength={128} onChange={(e) => mudar("senha", e.target.value)} />
          </Field>
          <Checkbox
            className={styles.largo}
            rotulo={<>Ativo{proprio && " (você não pode inativar a si mesmo)"}</>}
            checked={form.ativo}
            disabled={proprio}
            onChange={(e) => mudar("ativo", e.target.checked)}
          />
        </form>
      </Modal>

      <Modal
        aberto={inativando !== null}
        titulo="Inativar usuário"
        onFechar={() => setInativando(null)}
        acoes={
          <>
            <Button onClick={() => setInativando(null)}>Cancelar</Button>
            <Button
              variante="perigo"
              disabled={inativar.isPending}
              onClick={() =>
                inativando &&
                inativar.mutate(inativando.id, {
                  onSuccess: () => setMensagem(`“${inativando.nome}” inativado.`),
                  onSettled: () => setInativando(null),
                })
              }
            >
              {inativar.isPending ? "Inativando…" : "Inativar"}
            </Button>
          </>
        }
      >
        <p>
          {inativando?.nome} perde o acesso imediatamente e as sessões abertas são encerradas. Planos, ações e histórico
          continuam registrados em nome dele. É possível reativar depois.
        </p>
      </Modal>
    </div>
  );
}
