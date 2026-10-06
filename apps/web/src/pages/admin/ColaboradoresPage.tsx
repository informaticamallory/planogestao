import type { ConviteItem } from "@planogestao/shared-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import styles from "../../components/admin/Admin.module.css";
import { AreasAutorizadas, type SelecaoAreas } from "../../components/admin/AreasAutorizadas";
import { ConfirmarOperacao } from "../../components/planos/ConfirmarOperacao";
import { Badge, type BadgeTom } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Field, fieldAria } from "../../components/ui/Field";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Table } from "../../components/ui/Table";
import { api } from "../../services/api";
import { useAuthStore } from "../../store/authStore";
import { formatarDataHora } from "../../utils/datas";

const SITUACAO: Record<ConviteItem["situacao"], { rotulo: string; tom: BadgeTom }> = {
  pendente: { rotulo: "Convite pendente", tom: "aviso" },
  ativado: { rotulo: "Ativado", tom: "sucesso" },
  cancelado: { rotulo: "Cancelado", tom: "neutro" },
  expirado: { rotulo: "Expirado", tom: "neutro" },
};
const ENVIO: Record<string, { rotulo: string; tom: BadgeTom }> = {
  pendente: { rotulo: "Enviando…", tom: "info" },
  enviando: { rotulo: "Enviando…", tom: "info" },
  enviado: { rotulo: "Enviado", tom: "sucesso" },
  falha: { rotulo: "Falha no envio", tom: "erro" },
  desabilitado: { rotulo: "Envio de e-mail desligado", tom: "erro" },
  modelo_inativo: { rotulo: "Modelo de convite desativado", tom: "erro" },
  sem_endereco: { rotulo: "E-mail inválido", tom: "erro" },
  ignorado: { rotulo: "Substituído", tom: "neutro" },
};
const EM_ENVIO = new Set(["pendente", "enviando"]);

interface Form {
  nome: string;
  email: string;
  area_id: string;
  setor_id: string;
  acesso: SelecaoAreas;
}

const vazio: Form = { nome: "", email: "", area_id: "", setor_id: "", acesso: { todas: false, ids: [] } };

function validar(f: Form) {
  const e: Partial<Record<keyof Form, string>> = {};
  if (f.nome.trim().split(/\s+/).join(" ").length < 3) e.nome = "Informe o nome completo.";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) e.email = "E-mail inválido.";
  if (!f.area_id) e.area_id = "Selecione a área de lotação.";
  if (!f.acesso.todas && f.acesso.ids.length === 0) e.acesso = "Selecione pelo menos uma área autorizada.";
  return e;
}

/** Gestor (e Administrador) convida colaboradores: perfil Colaborador fixo, só nas áreas que ele acessa. */
export function ColaboradoresPage() {
  const qc = useQueryClient();
  const eu = useAuthStore((s) => s.usuario);
  const opcoes = useQuery({ queryKey: ["colaboradores", "opcoes"], queryFn: api.colaboradores.opcoes });
  const convites = useQuery({
    queryKey: ["colaboradores", "convites"],
    queryFn: api.colaboradores.listar,
    // Enquanto algum e-mail está na fila, acompanha até sair (enviado ou falha).
    refetchInterval: (q) => (q.state.data?.some((c) => c.envio && EM_ENVIO.has(c.envio)) ? 3000 : false),
  });
  const [form, setForm] = useState<Form>(vazio);
  const [erros, setErros] = useState<Partial<Record<keyof Form, string>>>({});
  const [acessoTocado, setAcessoTocado] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState<ConviteItem | null>(null);

  const recarregar = () => void qc.invalidateQueries({ queryKey: ["colaboradores"] });
  const convidar = useMutation({ mutationFn: api.colaboradores.convidar, onSuccess: recarregar });
  const reenviar = useMutation({ mutationFn: api.colaboradores.reenviar, onSuccess: recarregar });
  const cancelar = useMutation({ mutationFn: api.colaboradores.cancelar, onSuccess: recarregar });

  const areas = opcoes.data?.areas ?? [];
  const setores = areas.find((a) => String(a.id) === form.area_id)?.setores ?? [];
  const mudar = <K extends keyof Form>(campo: K, valor: Form[K]) => {
    setErros((e) => ({ ...e, [campo]: undefined }));
    setForm((f) => {
      const novo = { ...f, [campo]: valor, ...(campo === "area_id" ? { setor_id: "" } : {}) };
      // A lotação é sugerida como área autorizada até a seleção ser alterada.
      if (campo === "area_id" && !acessoTocado) novo.acesso = { todas: false, ids: valor ? [Number(valor)] : [] };
      return novo;
    });
  };

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const encontrados = validar(form);
    setErros(encontrados);
    if (Object.keys(encontrados).length) return;
    convidar.mutate(
      {
        nome: form.nome.trim(),
        email: form.email.trim(),
        area_id: Number(form.area_id),
        setor_id: form.setor_id ? Number(form.setor_id) : null,
        areas_autorizadas: form.acesso.ids,
        todas_areas: form.acesso.todas,
      },
      {
        onSuccess: (c) => {
          setMensagem(`Convite para ${c.nome} registrado. Acompanhe o envio na lista abaixo.`);
          setForm(vazio);
          setAcessoTocado(false);
        },
      },
    );
  };

  return (
    <div className={styles.pagina}>
      <header className={styles.cabecalho}>
        <div>
          <h1 className={styles.titulo}>Colaboradores</h1>
          <p className={styles.subtitulo}>
            Cadastre colaboradores por convite: a pessoa recebe um e-mail com o botão “Definir senha e acessar” (link pessoal, válido por 48
            horas e de uso único). O perfil é sempre <strong>{opcoes.data?.perfil ?? "Colaborador"}</strong>
            {eu?.perfil.nome !== "Administrador" && ", e as áreas ficam entre as que você acessa"}.
          </p>
        </div>
      </header>

      <Card>
        <form className={styles.form} onSubmit={enviar} noValidate>
          {convidar.error && <p className={`${styles.erro} ${styles.largo}`}>{convidar.error.message}</p>}
          <Field id="c-nome" rotulo="Nome completo" obrigatorio erro={erros.nome}>
            <Input {...fieldAria("c-nome", erros.nome)} value={form.nome} maxLength={150} onChange={(e) => mudar("nome", e.target.value)} />
          </Field>
          <Field id="c-email" rotulo="E-mail" obrigatorio erro={erros.email}>
            <Input {...fieldAria("c-email", erros.email)} type="email" autoComplete="off" value={form.email} maxLength={255} onChange={(e) => mudar("email", e.target.value)} />
          </Field>
          <Field id="c-area" rotulo="Área de lotação" obrigatorio erro={erros.area_id}>
            <Select {...fieldAria("c-area", erros.area_id)} value={form.area_id} onChange={(e) => mudar("area_id", e.target.value)}>
              <option value="">Selecione…</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="c-setor" rotulo="Setor">
            <Select id="c-setor" value={form.setor_id} disabled={!form.area_id} onChange={(e) => mudar("setor_id", e.target.value)}>
              <option value="">{form.area_id ? "Sem setor" : "Escolha a área antes"}</option>
              {setores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="c-acesso" rotulo="Áreas autorizadas" obrigatorio erro={erros.acesso} ajuda="Quais planos a pessoa poderá acessar.">
            <AreasAutorizadas
              id="c-acesso"
              areas={areas}
              valor={form.acesso}
              semTodas={!opcoes.data?.pode_todas_areas}
              invalido={!!erros.acesso}
              onChange={(acesso) => {
                setAcessoTocado(true);
                mudar("acesso", acesso);
              }}
            />
          </Field>
          <Field id="c-perfil" rotulo="Perfil">
            <Input id="c-perfil" value={opcoes.data?.perfil ?? "Colaborador"} readOnly />
          </Field>
          <div className={styles.largo}>
            <Button type="submit" variante="primaria" disabled={convidar.isPending || opcoes.isLoading}>
              {convidar.isPending ? "Enviando…" : "Enviar convite"}
            </Button>
          </div>
        </form>
      </Card>

      {mensagem && (
        <p className={styles.sucesso} role="status">
          {mensagem}
        </p>
      )}
      {(reenviar.error || cancelar.error) && <p className={styles.erro}>{(reenviar.error ?? cancelar.error)!.message}</p>}

      <Card semPadding>
        {convites.error ? (
          <p className={styles.erro}>Não foi possível carregar: {convites.error.message}</p>
        ) : !convites.data ? (
          <p className={styles.estado}>Carregando…</p>
        ) : convites.data.length === 0 ? (
          <p className={styles.estado}>Nenhum convite enviado ainda.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <th scope="col">Nome</th>
                <th scope="col">Áreas</th>
                <th scope="col">Situação</th>
                <th scope="col">Envio</th>
                <th scope="col" data-acoes>
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {convites.data.map((c) => {
                const envio = c.envio ? ENVIO[c.envio] ?? { rotulo: c.envio, tom: "neutro" as BadgeTom } : null;
                return (
                  <tr key={c.id}>
                    <td>
                      {c.nome}
                      <span className={styles.meta}>{c.email}</span>
                      {eu?.perfil.nome === "Administrador" && <span className={styles.meta}>Convidado por {c.criado_por}</span>}
                    </td>
                    <td>
                      {c.area ?? "—"}
                      {c.setor && <span className={styles.meta}>{c.setor}</span>}
                      <span className={styles.meta}>Acesso: {c.todas_areas ? "todas as áreas" : c.areas.join(", ") || "—"}</span>
                    </td>
                    <td>
                      <Badge tom={SITUACAO[c.situacao].tom}>{SITUACAO[c.situacao].rotulo}</Badge>
                      <span className={styles.meta}>
                        {c.situacao === "ativado" && c.ativado_em
                          ? `Ativado em ${formatarDataHora(c.ativado_em)}`
                          : c.situacao === "pendente"
                            ? `Link válido até ${formatarDataHora(c.expira_em)}`
                            : `Criado em ${formatarDataHora(c.criado_em)}`}
                      </span>
                    </td>
                    <td>
                      {envio && c.situacao !== "ativado" ? <Badge tom={envio.tom}>{envio.rotulo}</Badge> : "—"}
                      <span className={styles.meta}>{c.enviado_em ? `Enviado em ${formatarDataHora(c.enviado_em)}` : c.erro_envio ?? ""}</span>
                    </td>
                    <td data-acoes>
                      <div className={styles.acoesLinha}>
                        {c.pode_reenviar && (
                          <Button
                            variante="link"
                            disabled={reenviar.isPending}
                            onClick={() => reenviar.mutate(c.id, { onSuccess: () => setMensagem(`Novo link enviado para ${c.email}; o anterior deixou de valer.`) })}
                          >
                            {c.envio === "falha" ? "Tentar novamente" : "Reenviar"}
                          </Button>
                        )}
                        {c.pode_cancelar && (
                          <Button variante="link" className={styles.linkPerigo} onClick={() => (cancelar.reset(), setCancelando(c))}>
                            Cancelar
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <ConfirmarOperacao
        aberto={cancelando !== null}
        titulo="Cancelar convite?"
        identificacao={cancelando ? `${cancelando.nome} — ${cancelando.email}` : ""}
        rotuloBotao="Cancelar convite"
        pendente={cancelar.isPending}
        erro={cancelar.error?.message}
        onFechar={() => setCancelando(null)}
        onConfirmar={() => cancelando && cancelar.mutate(cancelando.id, { onSuccess: () => setCancelando(null) })}
      >
        <p>O link enviado deixa de valer imediatamente. A conta continua cadastrada (sem acesso) e você pode reenviar o convite depois.</p>
      </ConfirmarOperacao>
    </div>
  );
}
