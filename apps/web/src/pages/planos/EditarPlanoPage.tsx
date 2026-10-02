import type { PlanoDetalhe } from "@planogestao/shared-types";
import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { EtapaIdentificacao } from "../../components/planos/novo/EtapaIdentificacao";
import { EtapaProblema } from "../../components/planos/novo/EtapaProblema";
import {
  focarPrimeiroErro,
  formularioAlterado,
  formularioDoPlano,
  paraAtualizacao,
  validarEtapa1,
  validarEtapa2,
  type PlanoForm,
} from "../../components/planos/novo/formularioPlano";
import { SeletorModo, useModoFormularioPlano } from "../../components/planos/novo/SeletorModo";
import { Button, ButtonLink } from "../../components/ui/Button";
import { Field } from "../../components/ui/Field";
import { Modal } from "../../components/ui/Modal";
import { Select } from "../../components/ui/Select";
import { PlanStatusBadge } from "../../components/ui/StatusBadges";
import { Wizard } from "../../components/ui/Wizard";
import { useAtualizarPlano, usePlanoDetalhe } from "../../hooks/usePlano";
import { useOpcoesPlanos } from "../../hooks/usePlanos";
import { useProtecaoSaida } from "../../hooks/useProtecaoSaida";
import styles from "./NovoPlanoPage.module.css";

// As ações têm aba própria no detalhe do plano; a edição cobre só estas duas seções.
const ETAPAS = ["Identificação", "Problema/Oportunidade"];

export function EditarPlanoPage() {
  const planoId = Number(useParams().id);
  const detalhe = usePlanoDetalhe(planoId);

  if (detalhe.error) return <p className={styles.alerta}>Não foi possível carregar o plano: {detalhe.error.message}</p>;
  if (!detalhe.data) return <p>Carregando plano…</p>;
  if (!detalhe.data.permissoes.editar) {
    return (
      <div className={styles.novoPlanoPage}>
        <h1 className={styles.titulo}>Edição indisponível</h1>
        <p>Este plano não pode ser editado (sem permissão ou arquivado — arquivado é somente leitura).</p>
        <Link to={`/planos/${planoId}`}>Voltar ao plano</Link>
      </div>
    );
  }
  // Monta o formulário só depois de ter o plano (estado inicial = dados atuais).
  return <FormularioEdicao plano={detalhe.data} />;
}

function FormularioEdicao({ plano }: { plano: PlanoDetalhe }) {
  const navigate = useNavigate();
  const opcoes = useOpcoesPlanos();
  const atualizar = useAtualizarPlano(plano.id);

  const [form, setForm] = useState<PlanoForm>(() => formularioDoPlano(plano));
  const inicial = useRef(form);
  const [mostrarErros, setMostrarErros] = useState(false);
  const [modo, setModo] = useModoFormularioPlano();
  const [etapa, setEtapa] = useState(0);

  const alterar = (parcial: Partial<PlanoForm>) => setForm((f) => ({ ...f, ...parcial }));
  // Plano liberado (ou sendo liberado agora) exige a etapa 2; o rascunho não.
  const exigeEtapa2 = !form.rascunho;
  const errosPorEtapa = [validarEtapa1(form), validarEtapa2(form, !exigeEtapa2)];
  const pendente = errosPorEtapa.map((e) => Object.keys(e).length > 0);
  const erros = (i: number) => (mostrarErros ? errosPorEtapa[i]! : {});

  const alterado = formularioAlterado(form, inicial.current);
  const { blocker, liberar } = useProtecaoSaida(alterado);

  const irPara = (i: number) => {
    setEtapa(i);
    window.scrollTo({ top: 0 });
  };

  const salvar = () => {
    setMostrarErros(true);
    const comErro = pendente.findIndex(Boolean);
    if (comErro >= 0) {
      setEtapa(comErro);
      return focarPrimeiroErro();
    }
    atualizar.mutate(paraAtualizacao(form), {
      onSuccess: (r) => {
        liberar();
        navigate(`/planos/${plano.id}`, { state: { avisos: r.avisos } });
      },
    });
  };

  const etapasComErro = ETAPAS.filter((_, i) => mostrarErros && pendente[i]);

  return (
    <div className={styles.novoPlanoPage}>
      <div className={styles.cabecalho}>
        <h1 className={styles.titulo}>Editar {plano.codigo}</h1>
        <SeletorModo modo={modo} onMudar={setModo} />
      </div>

      <Wizard
        modo={modo}
        atual={etapa}
        onIrPara={irPara}
        secoes={[
          {
            titulo: ETAPAS[0]!,
            conteudo: (
              <EtapaIdentificacao
                form={form}
                alterar={alterar}
                erros={erros(0)}
                opcoes={opcoes.data}
                codigo={plano.codigo}
                campoStatus={
                  <div className={styles.campoSituacao}>
                    <span className={styles.rotuloSituacao}>Status</span>
                    <PlanStatusBadge status={plano.status} prazoTag={plano.prazo_tag} />
                    <span className={styles.ajudaSituacao}>Calculado pelas ações (não é editável).</span>
                    {plano.rascunho && (
                      <Field
                        id="situacao"
                        rotulo="Situação do rascunho"
                        ajuda={
                          form.rascunho
                            ? "Continua rascunho: ninguém é avisado ainda."
                            : "Ao salvar, o plano é liberado: exige problema, objetivo e ao menos uma ação; os responsáveis são avisados."
                        }
                      >
                        <Select
                          id="situacao"
                          value={form.rascunho ? "rascunho" : "liberar"}
                          onChange={(e) => alterar({ rascunho: e.target.value === "rascunho" })}
                        >
                          <option value="rascunho">Manter como rascunho</option>
                          <option value="liberar">Liberar o plano</option>
                        </Select>
                      </Field>
                    )}
                  </div>
                }
              />
            ),
          },
          {
            titulo: ETAPAS[1]!,
            conteudo: <EtapaProblema form={form} alterar={alterar} erros={erros(1)} obrigatorio={exigeEtapa2} mostrarAnexos={false} />,
          },
        ].map((s, i) => ({ ...s, pendente: pendente[i], comErro: mostrarErros }))}
        rodape={
          <>
            <ButtonLink to={`/planos/${plano.id}`}>Cancelar</ButtonLink>
            <span className={styles.espaco} />
            {atualizar.isError && (
              <span className={styles.erroSalvar} role="alert">
                Não foi possível salvar: {atualizar.error.message}
              </span>
            )}
            {!atualizar.isError && etapasComErro.length > 0 && (
              <span className={styles.erroSalvar} role="alert">
                Faltam campos obrigatórios em: {etapasComErro.join(", ")}.
              </span>
            )}
            {modo === "abas" && etapa > 0 && <Button onClick={() => irPara(etapa - 1)}>Anterior</Button>}
            {modo === "abas" && etapa < ETAPAS.length - 1 && <Button onClick={() => irPara(etapa + 1)}>Próximo</Button>}
            {/* Na edição dá para salvar de qualquer aba (ex.: só trocar o nome). */}
            <Button variante="primaria" onClick={salvar} disabled={atualizar.isPending || !alterado}>
              {atualizar.isPending ? "Salvando…" : "Salvar alterações"}
            </Button>
          </>
        }
      />

      <Modal
        aberto={blocker.state === "blocked"}
        titulo="Descartar alterações?"
        onFechar={() => blocker.reset?.()}
        acoes={
          <>
            <Button onClick={() => blocker.reset?.()}>
              Continuar editando
            </Button>
            <Button variante="perigo" onClick={() => blocker.proceed?.()}>
              Descartar
            </Button>
          </>
        }
      >
        <p>As alterações feitas neste plano ainda não foram salvas.</p>
      </Modal>
    </div>
  );
}
