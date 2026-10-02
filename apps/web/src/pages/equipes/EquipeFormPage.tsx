import type { UsuarioOpcao } from "@planogestao/shared-types";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import styles from "../../components/admin/Admin.module.css";
import estilos from "../../components/equipes/Equipes.module.css";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Field, fieldAria } from "../../components/ui/Field";
import { Icon } from "../../components/ui/Icon";
import { Checkbox, Input, Textarea } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { UserPicker } from "../../components/ui/UserPicker";
import { useEquipe, useSalvarEquipe } from "../../hooks/useEquipes";
import { useOpcoesPlanos } from "../../hooks/usePlanos";

interface Form {
  nome: string;
  area_id: string;
  setor_id: string;
  supervisor: UsuarioOpcao | null;
  descricao: string;
  ativo: boolean;
}
type Erros = Partial<Record<"nome" | "area_id" | "supervisor", string>>;

const vazio: Form = { nome: "", area_id: "", setor_id: "", supervisor: null, descricao: "", ativo: true };

/** Mesmas regras do backend (EquipeSalvar); ele revalida e decide o resto (duplicidade, setor da área). */
function validar(f: Form): Erros {
  const e: Erros = {};
  if (f.nome.trim().split(/\s+/).join(" ").length < 2) e.nome = "Informe um nome com pelo menos 2 caracteres.";
  if (!f.area_id) e.area_id = "Selecione a área.";
  if (!f.supervisor) e.supervisor = "Escolha o supervisor.";
  return e;
}

/** Criação (/equipes/nova) e edição (/equipes/:id/editar) em página própria. */
export function EquipeFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const equipeId = id ? Number(id) : null;
  const equipe = useEquipe(equipeId ?? Number.NaN);
  const opcoes = useOpcoesPlanos();
  const salvar = useSalvarEquipe();
  const [form, setForm] = useState<Form>(vazio);
  const [erros, setErros] = useState<Erros>({});

  useEffect(() => {
    const e = equipe.data;
    if (!e) return;
    setForm({
      nome: e.nome,
      area_id: String(e.area.id),
      setor_id: e.setor ? String(e.setor.id) : "",
      supervisor: { id: e.supervisor.id, nome: e.supervisor.nome, area: null },
      descricao: e.descricao ?? "",
      ativo: e.ativo,
    });
  }, [equipe.data]);

  const mudar = <K extends keyof Form>(campo: K, valor: Form[K]) => {
    setErros((e) => ({ ...e, [campo]: undefined }));
    salvar.reset();
    setForm((f) => ({ ...f, [campo]: valor, ...(campo === "area_id" ? { setor_id: "" } : {}) }));
  };

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const encontrados = validar(form);
    setErros(encontrados);
    if (Object.keys(encontrados).length) return;
    salvar.mutate(
      {
        id: equipeId,
        corpo: {
          nome: form.nome.trim(),
          area_id: Number(form.area_id),
          setor_id: form.setor_id ? Number(form.setor_id) : null,
          supervisor_id: form.supervisor!.id,
          descricao: form.descricao.trim() || null,
          ativo: form.ativo,
        },
      },
      { onSuccess: (salva) => navigate(`/equipes/${salva.id}${equipeId ? "" : "?aba=membros"}`, { replace: true }) },
    );
  };

  if (equipeId !== null && equipe.error) return <p className={styles.erro}>Não foi possível carregar a equipe: {equipe.error.message}</p>;
  if (equipeId !== null && !equipe.data) return <p className={styles.estado}>Carregando…</p>;

  const setores = (opcoes.data?.setores ?? []).filter((s) => String(s.area_id) === form.area_id);
  const voltar = equipeId ? `/equipes/${equipeId}` : "/equipes";

  return (
    <div className={styles.pagina}>
      <header>
        <Link to={voltar} className={estilos.migalha}>
          <Icon name="chevronLeft" size={15} />
          {equipeId ? equipe.data!.nome : "Equipes"}
        </Link>
        <h1 className={styles.titulo}>{equipeId ? "Editar equipe" : "Nova equipe"}</h1>
        {!equipeId && <p className={styles.subtitulo}>Depois de salvar, você adiciona os membros na página da equipe.</p>}
      </header>

      <Card>
        <form className={styles.form} onSubmit={enviar} noValidate>
          {salvar.error && <p className={`${styles.erro} ${styles.largo}`}>{salvar.error.message}</p>}
          <Field id="eq-nome" rotulo="Nome" obrigatorio erro={erros.nome} className={styles.largo}>
            <Input {...fieldAria("eq-nome", erros.nome)} value={form.nome} maxLength={100} autoFocus onChange={(e) => mudar("nome", e.target.value)} />
          </Field>
          <Field id="eq-area" rotulo="Área" obrigatorio erro={erros.area_id}>
            <Select {...fieldAria("eq-area", erros.area_id)} value={form.area_id} onChange={(e) => mudar("area_id", e.target.value)}>
              <option value="">Selecione…</option>
              {opcoes.data?.areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="eq-setor" rotulo="Setor (opcional)">
            <Select id="eq-setor" value={form.setor_id} disabled={!form.area_id} onChange={(e) => mudar("setor_id", e.target.value)}>
              <option value="">{form.area_id ? "Sem setor" : "Escolha a área antes"}</option>
              {setores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="eq-supervisor" rotulo="Supervisor" obrigatorio erro={erros.supervisor} className={styles.largo}>
            <UserPicker
              id="eq-supervisor"
              ariaLabel="Supervisor da equipe"
              valor={form.supervisor}
              onSelecionar={(u) => mudar("supervisor", u)}
              invalido={!!erros.supervisor}
              idErro={erros.supervisor ? "eq-supervisor-erro" : undefined}
            />
          </Field>
          <Field id="eq-descricao" rotulo="Descrição" className={styles.largo}>
            <Textarea id="eq-descricao" rows={3} maxLength={2000} value={form.descricao} onChange={(e) => mudar("descricao", e.target.value)} />
          </Field>
          <Checkbox
            className={styles.largo}
            rotulo="Ativa (equipes inativas não aparecem no filtro da Gamificação)"
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
