import type { CandidatoEquipe, PlanoOpcaoEquipe } from "@planogestao/shared-types";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import styles from "../../components/admin/Admin.module.css";
import { BuscaSelecao } from "../../components/equipes/BuscaSelecao";
import estilos from "../../components/equipes/Equipes.module.css";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Field, fieldAria } from "../../components/ui/Field";
import { Icon } from "../../components/ui/Icon";
import { Checkbox, Input, Textarea } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { useEquipe, useSalvarEquipe } from "../../hooks/useEquipes";
import { api } from "../../services/api";

/** Participante na composição em edição. `historico`: conta inativa que já estava na equipe (vínculo mantido). */
interface Participante extends CandidatoEquipe {
  historico?: boolean;
}

interface Form {
  nome: string;
  plano: PlanoOpcaoEquipe | null;
  descricao: string;
  participantes: Participante[];
  coordenador_id: string;
  ativo: boolean;
}
type Erros = Partial<Record<"nome" | "plano" | "participantes" | "coordenador", string>>;

const vazio: Form = { nome: "", plano: null, descricao: "", participantes: [], coordenador_id: "", ativo: true };
const textoPlano = (p: PlanoOpcaoEquipe) => `${p.codigo} — ${p.nome}`;

/** Mesmas regras do backend (que revalida e decide acesso, duplicidade e plano arquivado). */
function validar(f: Form, exigePlano: boolean): Erros {
  const e: Erros = {};
  if (f.nome.trim().split(/\s+/).join(" ").length < 2) e.nome = "Informe um nome com pelo menos 2 caracteres.";
  if (exigePlano && !f.plano) e.plano = "Selecione o plano de ação da equipe.";
  if (f.participantes.length === 0) e.participantes = "Inclua pelo menos um participante.";
  if (!f.coordenador_id) e.coordenador = "Escolha o coordenador entre os participantes.";
  else if (!f.participantes.some((p) => String(p.id) === f.coordenador_id))
    e.coordenador = "O coordenador da equipe precisa estar entre os participantes.";
  return e;
}

/** Criação (/equipes/nova[?plano_id=]) e edição (/equipes/:id/editar) em página própria. */
export function EquipeFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [params] = useSearchParams();
  const equipeId = id ? Number(id) : null;
  const planoInicial = Number(params.get("plano_id")) || null;
  const equipe = useEquipe(equipeId ?? Number.NaN);
  const salvar = useSalvarEquipe();
  const [form, setForm] = useState<Form>(vazio);
  const [erros, setErros] = useState<Erros>({});

  // "Nova equipe" a partir do plano: o plano já vem preenchido (se o usuário gerencia as equipes dele).
  const preenchido = useQuery({
    queryKey: ["equipes", "opcoes-planos", "id", planoInicial],
    queryFn: () => api.equipes.planosGerenciaveis({ plano_id: planoInicial! }),
    enabled: equipeId === null && planoInicial !== null,
  });
  useEffect(() => {
    const p = preenchido.data?.[0];
    if (p) setForm((f) => (f.plano ? f : { ...f, plano: p }));
  }, [preenchido.data]);

  useEffect(() => {
    const e = equipe.data;
    if (!e) return;
    setForm({
      nome: e.nome,
      plano: e.plano ? { id: e.plano.id, codigo: e.plano.codigo, nome: e.plano.nome, area: e.area } : null,
      descricao: e.descricao ?? "",
      participantes: e.participantes.map((p) => ({
        id: p.usuario_id,
        nome: p.nome,
        email: p.email,
        avatar_url: p.avatar_url,
        area: p.area,
        funcao_cargo: p.funcao_cargo,
        historico: !p.ativo,
      })),
      // Cadastro antigo com coordenador fora da lista: a validação pede para escolher de novo.
      coordenador_id: String(e.coordenador.id),
      ativo: e.ativo,
    });
  }, [equipe.data]);

  const mudar = <K extends keyof Form>(campo: K, valor: Form[K]) => {
    setErros((e) => ({ ...e, [campo === "coordenador_id" ? "coordenador" : campo]: undefined }));
    salvar.reset();
    setForm((f) => ({ ...f, [campo]: valor }));
  };

  const incluir = (u: CandidatoEquipe) => {
    if (form.participantes.some((p) => p.id === u.id)) return; // a lista já esconde os escolhidos; isto é só proteção
    setErros((e) => ({ ...e, participantes: undefined }));
    salvar.reset();
    setForm((f) => ({
      ...f,
      participantes: [...f.participantes, u],
      // Primeiro participante vira coordenador sugerido (pode trocar).
      coordenador_id: f.coordenador_id || String(u.id),
    }));
  };

  const remover = (uid: number) => {
    salvar.reset();
    setForm((f) => ({
      ...f,
      participantes: f.participantes.filter((p) => p.id !== uid),
      coordenador_id: f.coordenador_id === String(uid) ? "" : f.coordenador_id,
    }));
  };

  const escolhidos = useMemo(() => new Set(form.participantes.map((p) => p.id)), [form.participantes]);
  const semPlanoAntes = equipeId !== null && equipe.data ? equipe.data.plano === null : false;
  const planoFixo = equipeId !== null && !semPlanoAntes;

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const encontrados = validar(form, !semPlanoAntes);
    setErros(encontrados);
    if (Object.keys(encontrados).length) return;
    salvar.mutate(
      {
        id: equipeId,
        corpo: {
          nome: form.nome.trim(),
          plano_id: form.plano?.id ?? null,
          descricao: form.descricao.trim() || null,
          participantes: form.participantes.map((p) => p.id),
          coordenador_id: Number(form.coordenador_id),
          ativo: form.ativo,
        },
      },
      { onSuccess: (salva) => navigate(`/equipes/${salva.id}`, { replace: true }) },
    );
  };

  if (equipeId !== null && equipe.error) return <p className={styles.erro}>Não foi possível carregar a equipe: {equipe.error.message}</p>;
  if (equipeId !== null && !equipe.data) return <p className={styles.estado}>Carregando…</p>;
  const voltar = equipeId ? `/equipes/${equipeId}` : planoInicial ? `/planos/${planoInicial}?aba=equipes` : "/equipes";

  if (equipe.data && !equipe.data.pode_gerenciar) {
    return (
      <div className={styles.pagina}>
        <h1 className={styles.titulo}>Editar equipe</h1>
        <p className={styles.subtitulo}>
          {equipe.data.somente_leitura ?? "Você não gerencia as equipes deste plano."} <Link to={voltar}>Voltar para a equipe</Link>
        </p>
      </div>
    );
  }

  // Participantes: pela área do plano escolhido; equipe antiga sem plano usa a área dela até a regularização.
  const buscaParticipantes = form.plano ? { plano_id: form.plano.id } : semPlanoAntes ? { equipe_id: equipeId! } : null;

  return (
    <div className={styles.pagina}>
      <header>
        <Link to={voltar} className={estilos.migalha}>
          <Icon name="chevronLeft" size={15} />
          {equipeId ? equipe.data!.nome : planoInicial ? "Plano" : "Equipes"}
        </Link>
        <h1 className={styles.titulo}>{equipeId ? "Editar equipe" : "Nova equipe"}</h1>
        <p className={styles.subtitulo}>
          A área da equipe é a do plano. Os participantes podem ter funções/cargos diferentes; o coordenador é um deles e o
          papel não muda o perfil de acesso de ninguém.
        </p>
      </header>

      <Card>
        <form className={styles.form} onSubmit={enviar} noValidate>
          {salvar.error && <p className={`${styles.erro} ${styles.largo}`}>{salvar.error.message}</p>}
          <Field id="eq-nome" rotulo="Nome da equipe" obrigatorio erro={erros.nome} className={styles.largo}>
            <Input {...fieldAria("eq-nome", erros.nome)} value={form.nome} maxLength={100} autoFocus onChange={(e) => mudar("nome", e.target.value)} />
          </Field>

          <Field
            id="eq-plano"
            rotulo="Plano de ação"
            obrigatorio={!semPlanoAntes}
            erro={erros.plano}
            className={styles.largo}
            ajuda={
              planoFixo
                ? "O plano de uma equipe não muda. Para outro plano, cadastre uma nova equipe."
                : semPlanoAntes
                  ? "Equipe sem plano vinculado: escolha o plano para regularizar (opcional nesta edição)."
                  : "Somente planos ativos que você gerencia. Busque pelo código ou pelo nome."
            }
          >
            {planoFixo ? (
              <p className={estilos.planoFixo}>
                <strong>{form.plano && textoPlano(form.plano)}</strong>
                <span className={styles.meta}>Área {form.plano?.area.nome}</span>
              </p>
            ) : (
              <BuscaSelecao<PlanoOpcaoEquipe>
                id="eq-plano"
                ariaLabel="Plano de ação da equipe"
                placeholder="Código ou nome do plano"
                chave={["equipes", "opcoes-planos"]}
                buscar={(termo) => api.equipes.planosGerenciaveis({ q: termo || undefined })}
                idDe={(p) => p.id}
                textoDe={textoPlano}
                detalheDe={(p) => p.area.nome}
                valor={form.plano}
                onSelecionar={(p) => mudar("plano", p)}
                onLimpar={() => mudar("plano", null)}
                invalido={!!erros.plano}
                idErro={erros.plano ? "eq-plano-erro" : undefined}
                vazio="Nenhum plano ativo que você gerencie com esse termo."
              />
            )}
            {form.plano && !planoFixo && <span className={styles.meta}>Área da equipe: {form.plano.area.nome}</span>}
          </Field>

          <Field id="eq-descricao" rotulo="Descrição / Objetivo" className={styles.largo} ajuda="Para que a equipe existe e o que ela deve entregar.">
            <Textarea id="eq-descricao" rows={3} maxLength={2000} value={form.descricao} onChange={(e) => mudar("descricao", e.target.value)} />
          </Field>

          <Field
            id="eq-participantes"
            rotulo="Participantes"
            obrigatorio
            erro={erros.participantes}
            className={styles.largo}
            ajuda={
              buscaParticipantes
                ? "Contas ativas com acesso à área do plano. Busque por nome ou e-mail; inclua e remova antes de salvar."
                : "Selecione o plano antes dos participantes."
            }
          >
            <BuscaSelecao<CandidatoEquipe>
              id="eq-participantes"
              ariaLabel="Buscar participante por nome ou e-mail"
              placeholder={buscaParticipantes ? "Nome ou e-mail" : "Selecione o plano antes"}
              chave={["equipes", "opcoes-participantes", buscaParticipantes]}
              buscar={(termo) => api.equipes.candidatos({ ...buscaParticipantes!, q: termo || undefined })}
              idDe={(u) => u.id}
              textoDe={(u) => u.nome}
              detalheDe={(u) => [u.area, u.funcao_cargo].filter(Boolean).join(" · ") || u.email}
              onSelecionar={incluir}
              ocultar={escolhidos}
              desabilitado={!buscaParticipantes}
              invalido={!!erros.participantes}
              idErro={erros.participantes ? "eq-participantes-erro" : undefined}
              vazio="Ninguém com acesso ao plano encontrado (ou todos já estão na equipe)."
            />
          </Field>

          <div className={`${styles.largo} ${estilos.composicao}`}>
            <p className={estilos.tituloComposicao} id="eq-composicao">
              Composição ({form.participantes.length} participante{form.participantes.length === 1 ? "" : "s"})
            </p>
            {form.participantes.length === 0 ? (
              <p className={styles.meta}>Nenhum participante incluído.</p>
            ) : (
              <ul className={estilos.listaParticipantes} aria-labelledby="eq-composicao">
                {form.participantes.map((p) => (
                  <li key={p.id} className={estilos.participante} data-inativo={p.historico ? true : undefined}>
                    <span className={estilos.pessoa}>
                      <strong>{p.nome}</strong>
                      {String(p.id) === form.coordenador_id && <Badge tom="primaria">Coordenador</Badge>}
                      {p.historico && <Badge tom="neutro">Conta inativa (vínculo mantido)</Badge>}
                      <span className={styles.meta}>{p.email}</span>
                    </span>
                    <span className={estilos.lotacao}>
                      <span>{p.area ?? "Sem área"}</span>
                      <span className={styles.meta}>{p.funcao_cargo ?? "Sem função/cargo"}</span>
                    </span>
                    <Button variante="link" className={estilos.remover} onClick={() => remover(p.id)} aria-label={`Remover ${p.nome} da equipe`}>
                      Remover
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Field
            id="eq-coordenador"
            rotulo="Coordenador da equipe"
            obrigatorio
            erro={erros.coordenador}
            ajuda="Um dos participantes. Papel interno da equipe: não altera o perfil de acesso."
          >
            <Select {...fieldAria("eq-coordenador", erros.coordenador)} value={form.coordenador_id} onChange={(e) => mudar("coordenador_id", e.target.value)}>
              <option value="">{form.participantes.length ? "Selecione…" : "Inclua participantes antes"}</option>
              {form.participantes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </Select>
          </Field>

          <Checkbox
            className={styles.largo}
            rotulo="Ativa (equipe inativa não dá acesso ao plano e sai do filtro da Gamificação)"
            checked={form.ativo}
            onChange={(e) => mudar("ativo", e.target.checked)}
          />
          <div className={`${styles.barra} ${styles.largo}`} style={{ justifyContent: "flex-end" }}>
            <Button onClick={() => navigate(voltar)}>Cancelar</Button>
            <Button type="submit" variante="primaria" disabled={salvar.isPending}>
              {salvar.isPending ? "Salvando…" : equipeId ? "Salvar alterações" : "Criar equipe"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
