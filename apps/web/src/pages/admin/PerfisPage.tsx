import type { CatalogoPermissoes, PerfilItem } from "@planogestao/shared-types";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";

import styles from "../../components/admin/Admin.module.css";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Field, fieldAria } from "../../components/ui/Field";
import { Checkbox, Input } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { Table } from "../../components/ui/Table";
import { useCatalogoPermissoes, useMutacaoAdmin, usePerfisAdmin } from "../../hooks/useAdministracao";
import { api } from "../../services/api";

interface Rascunho {
  nome: string;
  descricao: string;
  permissoes: Set<string>;
}

const doPerfil = (p: PerfilItem | null): Rascunho => ({
  nome: p?.nome ?? "",
  descricao: p?.descricao ?? "",
  permissoes: new Set(p?.permissoes ?? []),
});

const mesmoConteudo = (a: Rascunho, b: Rascunho) =>
  a.nome === b.nome && a.descricao === b.descricao && a.permissoes.size === b.permissoes.size && [...a.permissoes].every((c) => b.permissoes.has(c));

export function PerfisPage() {
  const [params, setParams] = useSearchParams();
  const perfis = usePerfisAdmin();
  const catalogo = useCatalogoPermissoes();

  const selecionado = params.get("perfil");
  const perfil = perfis.data?.find((p) => String(p.id) === selecionado) ?? null;
  const novo = selecionado === "novo";

  // Sem seleção válida: abre o primeiro perfil.
  useEffect(() => {
    if (perfis.data?.length && !novo && !perfil) setParams({ perfil: String(perfis.data[0]!.id) }, { replace: true });
  }, [perfis.data, novo, perfil, setParams]);

  return (
    <div className={styles.pagina}>
      <header className={styles.cabecalho}>
        <div>
          <h1 className={styles.titulo}>Perfis</h1>
          <p className={styles.subtitulo}>
            A matriz mostra só as permissões que o sistema verifica; células sem permissão correspondente ficam
            desabilitadas (por exemplo, não há exclusão de planos: eles são arquivados, o que faz parte de “Editar”). O
            módulo Administração é exclusivo do perfil Administrador e não aparece aqui.
          </p>
        </div>
        <Button variante="primaria" onClick={() => setParams({ perfil: "novo" })}>
          + Novo perfil
        </Button>
      </header>

      <div className={styles.layoutPerfis}>
        <Card semPadding como="nav" aria-label="Perfis">
          {perfis.isLoading ? (
            <p className={styles.estado}>Carregando…</p>
          ) : perfis.error ? (
            <p className={styles.erro}>{perfis.error.message}</p>
          ) : (
            <ul className={styles.listaPerfis}>
              {perfis.data?.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={styles.itemPerfil}
                    aria-current={String(p.id) === selecionado}
                    onClick={() => setParams({ perfil: String(p.id) })}
                  >
                    <span>
                      {p.nome} {!p.editavel && <Badge tom="info">Fixo</Badge>}
                    </span>
                    <span className={styles.meta}>
                      {p.usuarios} usuário(s) · {p.editavel ? `${p.permissoes.length} permissão(ões)` : "acesso total"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card semPadding aria-label="Editar perfil">
          {!catalogo.data ? (
            <p className={styles.estado}>{catalogo.error ? catalogo.error.message : "Carregando…"}</p>
          ) : novo || perfil ? (
            <EditorPerfil
              key={novo ? "novo" : perfil!.id}
              perfil={novo ? null : perfil}
              catalogo={catalogo.data}
              onSalvo={(p) => setParams({ perfil: String(p.id) }, { replace: true })}
              onExcluido={() => setParams({}, { replace: true })}
            />
          ) : (
            <p className={styles.estado}>Selecione um perfil.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

interface EditorProps {
  perfil: PerfilItem | null;
  catalogo: CatalogoPermissoes;
  onSalvo: (p: PerfilItem) => void;
  onExcluido: () => void;
}

function EditorPerfil({ perfil, catalogo, onSalvo, onExcluido }: EditorProps) {
  const original = useMemo(() => doPerfil(perfil), [perfil]);
  const [rascunho, setRascunho] = useState<Rascunho>(original);
  const [erroNome, setErroNome] = useState<string>();
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const somenteLeitura = perfil !== null && !perfil.editavel;
  const alterado = !mesmoConteudo(rascunho, original);

  // Administrador: tudo marcado e bloqueado.
  const marcado = (codigo: string) => somenteLeitura || rascunho.permissoes.has(codigo);

  const salvar = useMutacaoAdmin((r: Rascunho) => {
    const corpo = { nome: r.nome.trim(), descricao: r.descricao.trim() || null, permissoes: [...r.permissoes].sort() };
    return perfil ? api.admin.perfis.atualizar(perfil.id, corpo) : api.admin.perfis.criar(corpo);
  });
  const excluir = useMutacaoAdmin((id: number) => api.admin.perfis.excluir(id));

  const alternar = (codigo: string) =>
    setRascunho((r) => {
      const permissoes = new Set(r.permissoes);
      if (permissoes.has(codigo)) permissoes.delete(codigo);
      else permissoes.add(codigo);
      return { ...r, permissoes };
    });

  const celula = (modulo: string, acao: string) => catalogo.permissoes.filter((p) => p.modulo === modulo && p.acao === acao);
  const colunasGrade = catalogo.acoes.filter((a) => a.id !== "outra");

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (rascunho.nome.trim().length < 2) return setErroNome("Informe um nome com pelo menos 2 caracteres.");
    salvar.mutate(rascunho, {
      onSuccess: (p) => {
        setMensagem("Perfil salvo. Usuários com este perfil passam a ter as novas permissões na próxima ação no sistema.");
        onSalvo(p);
      },
    });
  };

  const caixa = (p: CatalogoPermissoes["permissoes"][number], comRotulo = false) => (
    <Checkbox
      key={p.codigo}
      title={p.descricao ?? p.codigo}
      rotulo={comRotulo ? (p.descricao ?? p.codigo) : undefined}
      checked={marcado(p.codigo)}
      disabled={somenteLeitura}
      onChange={() => alternar(p.codigo)}
      aria-label={comRotulo ? undefined : p.descricao ?? p.codigo}
    />
  );

  return (
    <form className={styles.editorPerfil} onSubmit={enviar} noValidate>
      {somenteLeitura && (
        <p className={styles.subtitulo}>
          O perfil Administrador é fixo: tem sempre todas as permissões, inclusive o módulo Administração, e não pode ser
          alterado nem excluído.
        </p>
      )}
      {salvar.error && <p className={styles.erro}>{salvar.error.message}</p>}
      {excluir.error && <p className={styles.erro}>{excluir.error.message}</p>}
      {mensagem && !alterado && (
        <p className={styles.sucesso} role="status">
          {mensagem}
        </p>
      )}

      <div className={styles.form}>
        <Field id="perfil-nome" rotulo="Nome" obrigatorio erro={erroNome}>
          <Input
            {...fieldAria("perfil-nome", erroNome)}
            value={rascunho.nome}
            maxLength={50}
            readOnly={somenteLeitura}
            onChange={(e) => {
              setErroNome(undefined);
              setRascunho((r) => ({ ...r, nome: e.target.value }));
            }}
          />
        </Field>
        <Field id="perfil-descricao" rotulo="Descrição">
          <Input
            id="perfil-descricao"
            value={rascunho.descricao}
            maxLength={255}
            readOnly={somenteLeitura}
            onChange={(e) => setRascunho((r) => ({ ...r, descricao: e.target.value }))}
          />
        </Field>
      </div>

      <Table className={styles.matriz}>
        <caption className="sr-only">Permissões por módulo e ação</caption>
        <thead>
          <tr>
            <th scope="col" style={{ textAlign: "left" }}>
              Módulo
            </th>
            {colunasGrade.map((a) => (
              <th key={a.id} scope="col">
                {a.nome}
              </th>
            ))}
            <th scope="col" style={{ textAlign: "left" }}>
              Outras
            </th>
          </tr>
        </thead>
        <tbody>
          {catalogo.modulos.map((m) => (
            <tr key={m.id}>
              <th scope="row">{m.nome}</th>
              {colunasGrade.map((a) => {
                const itens = celula(m.id, a.id);
                return (
                  <td key={a.id}>
                    {itens.length ? (
                      itens.map((p) => caixa(p))
                    ) : (
                      <span className={styles.celulaVazia} title="Não se aplica a este módulo">
                        —
                      </span>
                    )}
                  </td>
                );
              })}
              <td>
                <div className={styles.outras}>{celula(m.id, "outra").map((p) => caixa(p, true))}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>

      {!somenteLeitura && (
        <div className={styles.rodapeEditor}>
          <span className={styles.meta}>
            {rascunho.permissoes.size} permissão(ões) marcada(s){alterado && " · alterações não salvas"}
          </span>
          <div className={styles.barra}>
            {perfil && (
              <Button variante="perigo" onClick={() => setConfirmarExclusao(true)} disabled={excluir.isPending}>
                Excluir perfil
              </Button>
            )}
            {alterado && (
              <Button onClick={() => setRascunho(original)}>Descartar</Button>
            )}
            <Button type="submit" variante="primaria" disabled={salvar.isPending || (!alterado && perfil !== null)}>
              {salvar.isPending ? "Salvando…" : perfil ? "Salvar alterações" : "Criar perfil"}
            </Button>
          </div>
        </div>
      )}

      <Modal
        aberto={confirmarExclusao}
        titulo="Excluir perfil"
        onFechar={() => setConfirmarExclusao(false)}
        acoes={
          <>
            <Button onClick={() => setConfirmarExclusao(false)}>Cancelar</Button>
            <Button
              variante="perigo"
              onClick={() =>
                perfil &&
                excluir.mutate(perfil.id, { onSuccess: onExcluido, onSettled: () => setConfirmarExclusao(false) })
              }
            >
              Excluir
            </Button>
          </>
        }
      >
        <p>
          Excluir o perfil “{perfil?.nome}”? Só é possível se nenhum usuário o utilizar
          {perfil?.usuarios ? ` — hoje ${perfil.usuarios} usuário(s) usam este perfil` : ""}.
        </p>
      </Modal>
    </form>
  );
}
