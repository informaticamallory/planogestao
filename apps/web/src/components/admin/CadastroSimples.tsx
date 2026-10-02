import type { UseQueryResult } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";

import { useMutacaoAdmin } from "../../hooks/useAdministracao";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Field, fieldAria } from "../ui/Field";
import { Checkbox, Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { Table } from "../ui/Table";
import styles from "./Admin.module.css";

export interface ItemCadastro {
  id: number;
  nome: string;
  ativo: boolean;
}

export interface FormCadastro {
  nome: string;
  ativo: boolean;
  /** Campos adicionais (ex.: area_id do setor). */
  extra: Record<string, string>;
}

interface Coluna<T> {
  titulo: string;
  numerica?: boolean;
  render: (item: T) => ReactNode;
}

interface CadastroSimplesProps<T extends ItemCadastro> {
  titulo: string;
  descricao: string;
  /** Ex.: "área" — usado em "Nova área", "Excluir área". */
  rotulo: string;
  feminino?: boolean;
  consulta: UseQueryResult<T[]>;
  colunas: Coluna<T>[];
  /** Filtro opcional da listagem (ex.: setores por área). */
  filtrar?: (item: T) => boolean;
  barra?: ReactNode;
  camposExtras?: (form: FormCadastro, mudar: (chave: string, valor: string) => void) => ReactNode;
  extraInicial?: (item: T | null) => Record<string, string>;
  validarExtra?: (form: FormCadastro) => string | null;
  salvar: (id: number | null, form: FormCadastro) => Promise<unknown>;
  excluir: (id: number) => Promise<unknown>;
}

/** Listagem + formulário (modal) de cadastros com nome/ativo. Regras (duplicidade, em uso) vêm da API. */
export function CadastroSimples<T extends ItemCadastro>(props: CadastroSimplesProps<T>) {
  const { titulo, descricao, rotulo, feminino, consulta, colunas, filtrar, barra, camposExtras, extraInicial, validarExtra } = props;
  const [editando, setEditando] = useState<T | "novo" | null>(null);
  const [form, setForm] = useState<FormCadastro>({ nome: "", ativo: true, extra: {} });
  const [erroNome, setErroNome] = useState<string>();
  const [excluindo, setExcluindo] = useState<T | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

  const salvar = useMutacaoAdmin((a: { id: number | null; form: FormCadastro }) => props.salvar(a.id, a.form));
  const excluir = useMutacaoAdmin((id: number) => props.excluir(id));

  const novo = feminino ? "Nova" : "Novo";
  const abrir = (item: T | null) => {
    setEditando(item ?? "novo");
    setForm({ nome: item?.nome ?? "", ativo: item?.ativo ?? true, extra: extraInicial?.(item) ?? {} });
    setErroNome(undefined);
    salvar.reset();
  };

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (form.nome.trim().length < 2) return setErroNome("Informe um nome com pelo menos 2 caracteres.");
    const erroExtra = validarExtra?.(form);
    if (erroExtra) return setErroNome(erroExtra);
    const id = editando === "novo" || !editando ? null : editando.id;
    salvar.mutate(
      { id, form: { ...form, nome: form.nome.trim() } },
      {
        onSuccess: () => {
          setMensagem(`${rotulo[0]!.toUpperCase()}${rotulo.slice(1)} “${form.nome.trim()}” salv${feminino ? "a" : "o"}.`);
          setEditando(null);
        },
      },
    );
  };

  const itens = (consulta.data ?? []).filter((i) => !filtrar || filtrar(i));

  return (
    <div className={styles.pagina}>
      <header className={styles.cabecalho}>
        <div>
          <h1 className={styles.titulo}>{titulo}</h1>
          <p className={styles.subtitulo}>{descricao}</p>
        </div>
        <div className={styles.barra}>
          {barra}
          <Button variante="primaria" onClick={() => abrir(null)}>
            + {novo} {rotulo}
          </Button>
        </div>
      </header>

      {mensagem && (
        <p className={styles.sucesso} role="status">
          {mensagem}
        </p>
      )}
      {excluir.error && <p className={styles.erro}>{excluir.error.message}</p>}

      <Card semPadding>
        {consulta.isLoading ? (
          <p className={styles.estado}>Carregando…</p>
        ) : consulta.error ? (
          <p className={styles.erro}>Não foi possível carregar: {consulta.error.message}</p>
        ) : itens.length === 0 ? (
          <p className={styles.estado}>Nenhum registro.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <th scope="col">Nome</th>
                {colunas.map((c) => (
                  <th key={c.titulo} scope="col" data-numerico={c.numerica || undefined}>
                    {c.titulo}
                  </th>
                ))}
                <th scope="col">Situação</th>
                <th scope="col" data-acoes>
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item) => (
                <tr key={item.id} data-inativo={item.ativo ? undefined : true}>
                  <td>{item.nome}</td>
                  {colunas.map((c) => (
                    <td key={c.titulo} data-numerico={c.numerica || undefined}>
                      {c.render(item)}
                    </td>
                  ))}
                  <td>
                    <Badge tom={item.ativo ? "sucesso" : "neutro"}>{item.ativo ? "Ativo" : "Inativo"}</Badge>
                  </td>
                  <td data-acoes>
                    <div className={styles.acoesLinha}>
                      <Button variante="link" onClick={() => abrir(item)}>
                        Editar
                      </Button>
                      <Button
                        variante="link"
                        className={styles.linkPerigo}
                        onClick={() => {
                          excluir.reset();
                          setExcluindo(item);
                        }}
                      >
                        Excluir
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal
        aberto={editando !== null}
        titulo={editando === "novo" ? `${novo} ${rotulo}` : `Editar ${rotulo}`}
        onFechar={() => setEditando(null)}
        acoes={
          <>
            <Button onClick={() => setEditando(null)}>Cancelar</Button>
            <Button type="submit" form="form-cadastro" variante="primaria" disabled={salvar.isPending}>
              {salvar.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </>
        }
      >
        <form id="form-cadastro" className={styles.form} onSubmit={enviar} noValidate>
          {salvar.error && <p className={`${styles.erro} ${styles.largo}`}>{salvar.error.message}</p>}
          <Field id="cad-nome" rotulo="Nome" obrigatorio erro={erroNome} className={styles.largo}>
            <Input
              {...fieldAria("cad-nome", erroNome)}
              value={form.nome}
              maxLength={100}
              autoFocus
              onChange={(e) => {
                setErroNome(undefined);
                setForm((f) => ({ ...f, nome: e.target.value }));
              }}
            />
          </Field>
          {camposExtras?.(form, (chave, valor) => setForm((f) => ({ ...f, extra: { ...f.extra, [chave]: valor } })))}
          <Checkbox
            className={styles.largo}
            rotulo="Ativo (inativos não aparecem nas opções de novos cadastros)"
            checked={form.ativo}
            onChange={(e) => setForm((f) => ({ ...f, ativo: e.target.checked }))}
          />
        </form>
      </Modal>

      <Modal
        aberto={excluindo !== null}
        titulo={`Excluir ${rotulo}`}
        onFechar={() => setExcluindo(null)}
        acoes={
          <>
            <Button onClick={() => setExcluindo(null)}>Cancelar</Button>
            <Button
              variante="perigo"
              disabled={excluir.isPending}
              onClick={() =>
                excluindo &&
                excluir.mutate(excluindo.id, {
                  onSuccess: () => setMensagem(`“${excluindo.nome}” excluíd${feminino ? "a" : "o"}.`),
                  onSettled: () => setExcluindo(null),
                })
              }
            >
              {excluir.isPending ? "Excluindo…" : "Excluir definitivamente"}
            </Button>
          </>
        }
      >
        <p>
          Excluir “{excluindo?.nome}”? Só é possível se não estiver em uso; caso esteja, inative pelo botão Editar para
          preservar o histórico.
        </p>
      </Modal>
    </div>
  );
}
