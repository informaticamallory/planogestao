import type { SetorItem } from "@planogestao/shared-types";
import { useQuery } from "@tanstack/react-query";
import { Fragment, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";

import styles from "../../components/admin/Admin.module.css";
import local from "../../components/admin/FuncoesCargos.module.css";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Field, fieldAria } from "../../components/ui/Field";
import { Icon } from "../../components/ui/Icon";
import { Checkbox, Input } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { Select } from "../../components/ui/Select";
import { Table } from "../../components/ui/Table";
import { useAreasAdmin, useMutacaoAdmin, useSetoresAdmin } from "../../hooks/useAdministracao";
import { api } from "../../services/api";

const plural = (n: number, um: string, varios: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? um : varios}`;

interface Form {
  area_id: string;
  nome: string;
  ativo: boolean;
}

/**
 * Funções e Cargos (tabela `setores`: mesmos IDs e vínculos). Uma linha por área; ao expandir, as funções/cargos
 * dela. Os totais da área vêm do backend sem repetir usuário ou plano.
 */
export function FuncoesCargosPage() {
  const [params, setParams] = useSearchParams();
  const filtroArea = Number(params.get("area_id")) || undefined;
  const areas = useAreasAdmin();
  const funcoes = useSetoresAdmin();
  // Mesma chave-raiz "admin": salvar/excluir pelo useMutacaoAdmin recarrega os totais também.
  const porArea = useQuery({ queryKey: ["admin", "setores", "por-area"], queryFn: api.admin.setores.porArea });
  const [abertas, setAbertas] = useState<Set<number>>(() => new Set(filtroArea ? [filtroArea] : []));
  const [editando, setEditando] = useState<SetorItem | "novo" | null>(null);
  const [form, setForm] = useState<Form>({ area_id: "", nome: "", ativo: true });
  const [erros, setErros] = useState<{ area?: string; nome?: string }>({});
  const [excluindo, setExcluindo] = useState<SetorItem | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

  const salvar = useMutacaoAdmin(({ id, f }: { id: number | null; f: Form }) => {
    const corpo = { nome: f.nome.trim(), ativo: f.ativo, area_id: Number(f.area_id) };
    return id ? api.admin.setores.atualizar(id, corpo) : api.admin.setores.criar(corpo);
  });
  const excluir = useMutacaoAdmin((id: number) => api.admin.setores.excluir(id));

  const linhas = (porArea.data ?? []).filter((a) => !filtroArea || a.id === filtroArea);
  const daArea = (areaId: number) => (funcoes.data ?? []).filter((f) => f.area_id === areaId);
  const alternar = (areaId: number) =>
    setAbertas((atual) => {
      const nova = new Set(atual);
      if (!nova.delete(areaId)) nova.add(areaId);
      return nova;
    });

  const abrirForm = (item: SetorItem | null, areaId?: number) => {
    setEditando(item ?? "novo");
    setForm(item ? { area_id: String(item.area_id), nome: item.nome, ativo: item.ativo } : { area_id: areaId ? String(areaId) : String(filtroArea ?? ""), nome: "", ativo: true });
    setErros({});
    salvar.reset();
  };

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const encontrados = {
      area: form.area_id ? undefined : "Selecione a área.",
      nome: form.nome.trim().length < 2 ? "Informe a função/cargo (pelo menos 2 caracteres)." : undefined,
    };
    setErros(encontrados);
    if (encontrados.area || encontrados.nome) return;
    const id = editando === "novo" || !editando ? null : editando.id;
    salvar.mutate(
      { id, f: form },
      {
        onSuccess: (salva) => {
          setMensagem(`Função/cargo “${salva.nome}” salva em ${salva.area}.`);
          setAbertas((a) => new Set(a).add(salva.area_id));
          setEditando(null);
        },
      },
    );
  };

  const carregando = porArea.isLoading || funcoes.isLoading;
  const erroCarga = porArea.error ?? funcoes.error;
  const areasDoForm = (areas.data ?? []).filter((a) => a.ativo || String(a.id) === form.area_id);

  return (
    <div className={styles.pagina}>
      <header className={styles.cabecalho}>
        <div>
          <h1 className={styles.titulo}>Funções e Cargos</h1>
          <p className={styles.subtitulo}>
            Funções e cargos de cada área (onde o colaborador trabalha). Clique na área para ver e cadastrar as funções/cargos dela. Equipes de
            trabalho são cadastradas no módulo Equipes.
          </p>
        </div>
        <div className={styles.barra}>
          <label className={styles.filtro}>
            Área
            <Select compacto value={filtroArea ?? ""} onChange={(e) => setParams(e.target.value ? { area_id: e.target.value } : {}, { replace: true })}>
              <option value="">Todas</option>
              {areas.data?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </Select>
          </label>
          <Button variante="primaria" onClick={() => abrirForm(null)}>
            + Nova função/cargo
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
        {carregando ? (
          <p className={styles.estado}>Carregando…</p>
        ) : erroCarga ? (
          <p className={styles.erro}>Não foi possível carregar: {erroCarga.message}</p>
        ) : linhas.length === 0 ? (
          <p className={styles.estado}>Nenhuma área cadastrada{filtroArea ? " com esse filtro" : ""}.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <th scope="col">Área</th>
                <th scope="col">Funções/Cargos</th>
                <th scope="col" data-numerico className={local.colNum}>
                  Usuários
                </th>
                <th scope="col" data-numerico className={local.colNum}>
                  Planos
                </th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((area) => {
                const aberta = abertas.has(area.id);
                const itens = daArea(area.id);
                const idPainel = `funcoes-area-${area.id}`;
                return (
                  <Fragment key={area.id}>
                    <tr className={local.linhaArea} data-inativo={area.ativo ? undefined : true} onClick={() => alternar(area.id)}>
                      <td>
                        <button
                          type="button"
                          className={local.expandir}
                          aria-expanded={aberta}
                          aria-controls={idPainel}
                          onClick={(e) => {
                            e.stopPropagation();
                            alternar(area.id);
                          }}
                        >
                          <Icon name={aberta ? "chevronDown" : "chevronRight"} size={16} strokeWidth={2.4} />
                          <span className={local.nomeArea}>{area.nome}</span>
                        </button>
                        {!area.ativo && <span className={styles.meta}>Área inativa</span>}
                        {/* Celular: os totais vão para baixo do nome (as colunas numéricas somem). */}
                        <span className={local.metaCelular}>
                          {plural(area.usuarios, "usuário", "usuários")} · {plural(area.planos, "plano", "planos")}
                        </span>
                      </td>
                      <td>{plural(area.funcoes, "função/cargo", "funções/cargos")}</td>
                      <td data-numerico className={local.colNum}>
                        {area.usuarios}
                      </td>
                      <td data-numerico className={local.colNum}>
                        {area.planos}
                      </td>
                    </tr>
                    {aberta && (
                      <tr id={idPainel} className={local.linhaPainel}>
                        <td colSpan={4}>
                          <div className={local.painel}>
                            {itens.length === 0 ? (
                              <p className={local.vazio}>Nenhuma função/cargo cadastrada nesta área.</p>
                            ) : (
                              <ul className={local.lista} aria-label={`Funções/cargos de ${area.nome}`}>
                                {itens.map((f) => (
                                  <li key={f.id} className={local.item} data-inativo={f.ativo ? undefined : true}>
                                    <span className={local.nomeFuncao}>{f.nome}</span>
                                    <span className={local.contagem}>{plural(f.usuarios, "usuário", "usuários")}</span>
                                    <span className={local.contagem}>{plural(f.planos, "plano", "planos")}</span>
                                    <Badge tom={f.ativo ? "sucesso" : "neutro"}>{f.ativo ? "Ativo" : "Inativo"}</Badge>
                                    <span className={styles.acoesLinha}>
                                      <Button variante="link" onClick={() => abrirForm(f)}>
                                        Editar
                                      </Button>
                                      <Button
                                        variante="link"
                                        className={styles.linkPerigo}
                                        onClick={() => {
                                          excluir.reset();
                                          setExcluindo(f);
                                        }}
                                      >
                                        Excluir
                                      </Button>
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                            {area.ativo && (
                              <Button tamanho="sm" onClick={() => abrirForm(null, area.id)}>
                                + Adicionar função/cargo
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal
        aberto={editando !== null}
        titulo={editando === "novo" ? "Nova função/cargo" : "Editar função/cargo"}
        onFechar={() => setEditando(null)}
        acoes={
          <>
            <Button onClick={() => setEditando(null)}>Cancelar</Button>
            <Button type="submit" form="form-funcao" variante="primaria" disabled={salvar.isPending}>
              {salvar.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </>
        }
      >
        <form id="form-funcao" className={styles.form} onSubmit={enviar} noValidate>
          {salvar.error && <p className={`${styles.erro} ${styles.largo}`}>{salvar.error.message}</p>}
          <Field
            id="fc-area"
            rotulo="Área"
            obrigatorio
            erro={erros.area}
            className={styles.largo}
            ajuda={editando !== "novo" ? "Uma função/cargo em uso não pode mudar de área." : undefined}
          >
            <Select
              {...fieldAria("fc-area", erros.area)}
              value={form.area_id}
              onChange={(e) => {
                setErros((x) => ({ ...x, area: undefined }));
                setForm((f) => ({ ...f, area_id: e.target.value }));
              }}
            >
              <option value="">Selecione…</option>
              {areasDoForm.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                  {!a.ativo && " (inativa)"}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="fc-nome" rotulo="Função/Cargo" obrigatorio erro={erros.nome} className={styles.largo}>
            <Input
              {...fieldAria("fc-nome", erros.nome)}
              value={form.nome}
              maxLength={100}
              autoFocus
              placeholder="Ex.: Analista de Engenharia"
              onChange={(e) => {
                setErros((x) => ({ ...x, nome: undefined }));
                setForm((f) => ({ ...f, nome: e.target.value }));
              }}
            />
          </Field>
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
        titulo="Excluir função/cargo"
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
                  onSuccess: () => setMensagem(`“${excluindo.nome}” excluída.`),
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
          Excluir “{excluindo?.nome}” ({excluindo?.area})? Só é possível se não estiver em uso por usuários, planos ou ações; caso esteja, inative
          pelo botão Editar para preservar o histórico.
        </p>
      </Modal>
    </div>
  );
}
