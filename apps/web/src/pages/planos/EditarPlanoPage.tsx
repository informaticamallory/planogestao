import type { AcaoDoPlano, PlanoDetalhe } from "@planogestao/shared-types";
import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { EtapaAcoes } from "../../components/planos/novo/EtapaAcoes";
import { EtapaIdentificacao } from "../../components/planos/novo/EtapaIdentificacao";
import { EtapaItensExistentes } from "../../components/planos/novo/EtapaItensExistentes";
import { EtapaProblema } from "../../components/planos/novo/EtapaProblema";
import {
  focarPrimeiroErro,
  formularioAlterado,
  formularioDoPlano,
  paraAtualizacao,
  validarEtapa1,
  validarEtapa2,
  validarEtapaAcoesEdicao,
  type PlanoForm,
} from "../../components/planos/novo/formularioPlano";
import stylesEtapas from "../../components/planos/novo/Etapas.module.css";
import { SeletorModo, useModoFormularioPlano } from "../../components/planos/novo/SeletorModo";
import { Button, ButtonLink } from "../../components/ui/Button";
import { Field, fieldAria } from "../../components/ui/Field";
import { Input } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { Select } from "../../components/ui/Select";
import { PlanStatusBadge } from "../../components/ui/StatusBadges";
import { Wizard } from "../../components/ui/Wizard";
import { useAcoesDoPlano, useAtualizarPlano, usePlanoDetalhe } from "../../hooks/usePlano";
import { useOpcoesPlanos } from "../../hooks/usePlanos";
import { useProtecaoSaida } from "../../hooks/useProtecaoSaida";
import styles from "./NovoPlanoPage.module.css";

// As mesmas etapas da criação. Na 3ª, os itens já cadastrados são alterados pelo id (nunca recriados).
const ETAPAS = ["Identificação", "Problema/Oportunidade", "Ações e Responsável"];

export function EditarPlanoPage() {
  const planoId = Number(useParams().id);
  const detalhe = usePlanoDetalhe(planoId);
  const acoes = useAcoesDoPlano(planoId);

  if (detalhe.error) return <p className={styles.alerta}>Não foi possível carregar o plano: {detalhe.error.message}</p>;
  if (acoes.error) return <p className={styles.alerta}>Não foi possível carregar as ações do plano: {acoes.error.message}</p>;
  if (!detalhe.data || !acoes.data) return <p>Carregando plano…</p>;
  if (!detalhe.data.permissoes.editar) {
    return (
      <div className={styles.novoPlanoPage}>
        <h1 className={styles.titulo}>Edição indisponível</h1>
        <p>Este plano não pode ser editado (sem permissão ou arquivado — arquivado é somente leitura).</p>
        <Link to={`/planos/${planoId}`}>Voltar ao plano</Link>
      </div>
    );
  }
  // Monta o formulário só depois de ter o plano e as ações (estado inicial = dados atuais).
  return <FormularioEdicao plano={detalhe.data} acoesDoPlano={acoes.data} />;
}

function FormularioEdicao({ plano, acoesDoPlano }: { plano: PlanoDetalhe; acoesDoPlano: AcaoDoPlano[] }) {
  const navigate = useNavigate();
  const opcoes = useOpcoesPlanos();
  const atualizar = useAtualizarPlano(plano.id);

  const [form, setForm] = useState<PlanoForm>(() => formularioDoPlano(plano, acoesDoPlano));
  const inicial = useRef(form);
  const [mostrarErros, setMostrarErros] = useState(false);
  const [modo, setModo] = useModoFormularioPlano();
  const [etapa, setEtapa] = useState(0);
  const [motivoPrazo, setMotivoPrazo] = useState("");
  // Datas estimadas mudadas num plano já liberado: o responsável/gestor é avisado (com o motivo, se houver).
  const mudouDatas =
    !plano.rascunho &&
    (form.data_inicio_estimado !== inicial.current.data_inicio_estimado || form.data_fim_estimado !== inicial.current.data_fim_estimado);

  const alterar = (parcial: Partial<PlanoForm>) => setForm((f) => ({ ...f, ...parcial }));
  // Plano liberado (ou sendo liberado agora) exige a etapa 2; o rascunho não.
  const exigeEtapa2 = !form.rascunho;
  const errosPorEtapa = [
    validarEtapa1(form),
    validarEtapa2(form, !exigeEtapa2),
    validarEtapaAcoesEdicao(form, inicial.current.itens, plano.rascunho && !form.rascunho, acoesDoPlano),
  ];
  const arquivados = acoesDoPlano.filter((a) => a.arquivada).length;
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
    const dados = paraAtualizacao(form, inicial.current.itens);
    atualizar.mutate(mudouDatas && motivoPrazo.trim() ? { ...dados, motivo_alteracao_prazo: motivoPrazo.trim() } : dados, {
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
                    {mudouDatas && (
                      <Field
                        id="motivo_prazo"
                        rotulo="Motivo da alteração das datas"
                        ajuda="Opcional. Vai para o histórico e para o aviso ao responsável pelo plano."
                      >
                        <Input {...fieldAria("motivo_prazo")} maxLength={200} value={motivoPrazo} onChange={(e) => setMotivoPrazo(e.target.value)} />
                      </Field>
                    )}
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
          {
            titulo: ETAPAS[2]!,
            conteudo: (
              <>
                <section className={stylesEtapas.secaoEtapa} aria-labelledby="titulo-itens">
                  <h2 id="titulo-itens" className={stylesEtapas.tituloSecao}>
                    Ações e sub-itens cadastrados
                  </h2>
                  <p className={stylesEtapas.notaAcao}>
                    Altere descrição, responsável, área, prazos, prioridade e pré-requisitos. Cada mudança vai para o histórico do item; status,
                    progresso e pontos não mudam aqui (seguem o aceite, a execução e a conclusão). O responsável pelo plano fica em
                    “Identificação”.
                    {arquivados > 0 && ` ${arquivados} item(ns) arquivado(s) não aparecem: desarquive-os pela aba Ações para alterar.`}
                  </p>
                  {erros(2).acoes && (
                    <p className={stylesEtapas.erroLista} role="alert">
                      {erros(2).acoes}
                    </p>
                  )}
                  <EtapaItensExistentes
                    itens={form.itens}
                    originais={inicial.current.itens}
                    onAlterar={(itens) => alterar({ itens })}
                    erros={erros(2)}
                    fimEstimado={form.data_fim_estimado}
                    acoesDoPlano={acoesDoPlano}
                  />
                </section>
                {plano.permissoes.adicionar_acoes && (
                  <section className={stylesEtapas.secaoEtapa} aria-labelledby="titulo-novas">
                    <h2 id="titulo-novas" className={stylesEtapas.tituloSecao}>
                      Novas ações
                    </h2>
                    <p className={stylesEtapas.notaAcao}>
                      Gravadas junto com as alterações acima. Sub-itens são criados na tela da ação, depois do aceite.
                    </p>
                    <EtapaAcoes
                      acoes={form.acoes}
                      onAlterar={(novas) => alterar({ acoes: novas })}
                      fimEstimado={form.data_fim_estimado}
                      prioridadePadrao={form.prioridade}
                      erros={{ ...erros(2), acoes: "" }}
                      acoesExistentes={acoesDoPlano}
                    />
                  </section>
                )}
              </>
            ),
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
