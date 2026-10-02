import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { EtapaAcoes } from "../../components/planos/novo/EtapaAcoes";
import { EtapaIdentificacao } from "../../components/planos/novo/EtapaIdentificacao";
import { EtapaProblema } from "../../components/planos/novo/EtapaProblema";
import {
  contarAcoesIncompletas,
  focarPrimeiroErro,
  formularioAlterado,
  formularioInicial,
  paraApi,
  validarEtapa1,
  validarEtapa2,
  validarEtapa3,
  type Erros,
  type PlanoForm,
} from "../../components/planos/novo/formularioPlano";
import { SeletorModo, useModoFormularioPlano } from "../../components/planos/novo/SeletorModo";
import { Button, ButtonLink } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { Wizard } from "../../components/ui/Wizard";
import { useCriarPlano, useOpcoesPlanos } from "../../hooks/usePlanos";
import { useProtecaoSaida } from "../../hooks/useProtecaoSaida";
import styles from "./NovoPlanoPage.module.css";

const ETAPAS = ["Identificação", "Problema/Oportunidade", "Ações e Responsável"];

export function NovoPlanoPage() {
  const navigate = useNavigate();
  const opcoes = useOpcoesPlanos();
  const criar = useCriarPlano();

  const [form, setForm] = useState<PlanoForm>(formularioInicial);
  const inicial = useRef(form);
  const [etapa, setEtapa] = useState(0);
  // Os erros de uma etapa só aparecem depois da primeira tentativa de avançar/salvar.
  const [mostrarErros, setMostrarErros] = useState([false, false, false]);
  const [erroAnexos, setErroAnexos] = useState<{ planoId: number; codigo: string; mensagem: string } | null>(null);

  const [modo, setModo] = useModoFormularioPlano();

  // "Salvar Plano" libera o plano: etapas 2 e 3 obrigatórias. "Salvar rascunho" exige só a etapa 1.
  const rascunho = false;
  const validar = (i: number): Erros =>
    [validarEtapa1, (f: PlanoForm) => validarEtapa2(f, rascunho), (f: PlanoForm) => validarEtapa3(f, rascunho)][i]!(form);
  // Validado sempre (para marcar as etapas pendentes); os erros só aparecem depois de tentar salvar.
  const errosPorEtapa = [0, 1, 2].map(validar);
  const pendente = errosPorEtapa.map((e) => Object.keys(e).length > 0);
  const errosVisiveis = (i: number): Erros => (mostrarErros[i] ? errosPorEtapa[i]! : {});

  const alterar = (parcial: Partial<PlanoForm>) => setForm((f) => ({ ...f, ...parcial }));
  const exibirErros = (etapas: number[]) => setMostrarErros((m) => m.map((v, j) => v || etapas.includes(j)));

  // ---- saída do fluxo ---------------------------------------------------------------

  const { blocker, liberar } = useProtecaoSaida(formularioAlterado(form, inicial.current));

  // ---- navegação entre etapas (livre: nunca valida ao trocar) ----------------------------

  const irPara = (i: number) => {
    setEtapa(i);
    window.scrollTo({ top: 0 });
  };

  // ---- salvar ----------------------------------------------------------------------------

  const gravar = (comoRascunho: boolean, aoConcluir: (planoId: number) => void) => {
    const { corpo } = paraApi(form, comoRascunho);
    criar.mutate(
      { corpo, anexos: form.anexos },
      {
        onSuccess: ({ criado, erroAnexos: falha }) => {
          liberar();
          if (falha) {
            setErroAnexos({ planoId: criado.plano.id, codigo: criado.plano.codigo, mensagem: falha });
            return;
          }
          aoConcluir(criado.plano.id);
        },
      },
    );
  };

  /** Mostra os erros das etapas indicadas e leva o usuário ao primeiro (abre a aba dele no modo Abas). */
  const barrar = (etapas: number[]) => {
    exibirErros(etapas);
    setEtapa(etapas[0]!);
    focarPrimeiroErro();
  };

  const salvarPlano = () => {
    // Validação "dura": todas as etapas, só no momento de salvar.
    const comErro = [0, 1, 2].filter((i) => pendente[i]);
    if (comErro.length) return barrar(comErro);
    gravar(false, (id) => navigate(`/planos/${id}`));
  };

  const etapa1Valida = !pendente[0];
  const acoesDescartadas = contarAcoesIncompletas(form);

  const salvarRascunho = (aoConcluir: (planoId: number) => void) => {
    if (!etapa1Valida) return barrar([0]);
    gravar(true, aoConcluir);
  };

  // ---- render ------------------------------------------------------------------------------

  if (erroAnexos) {
    return (
      <div className={styles.novoPlanoPage}>
        <h1 className={styles.titulo}>Plano {erroAnexos.codigo} criado</h1>
        <p className={styles.alerta} role="alert">
          O plano e as ações foram salvos, mas os anexos não puderam ser enviados: {erroAnexos.mensagem}
        </p>
        <ButtonLink to={`/planos/${erroAnexos.planoId}`} variante="primaria" className={styles.botaoInicio}>
          Ir para o plano
        </ButtonLink>
      </div>
    );
  }

  const abas = modo === "abas";
  // No modo Abas, o botão final só aparece na última aba; no Geral, sempre.
  const mostrarSalvar = !abas || etapa === ETAPAS.length - 1;
  const etapasComErro = ETAPAS.filter((_, i) => pendente[i] && mostrarErros[i]);

  return (
    <div className={styles.novoPlanoPage}>
      <div className={styles.cabecalho}>
        <h1 className={styles.titulo}>Novo Plano de Ação</h1>
        <SeletorModo modo={modo} onMudar={setModo} />
      </div>

      {opcoes.isError && <p className={styles.alerta}>Não foi possível carregar tipos, áreas e origens.</p>}

      <Wizard
        modo={modo}
        atual={etapa}
        onIrPara={irPara}
        secoes={[
          {
            titulo: ETAPAS[0]!,
            conteudo: <EtapaIdentificacao form={form} alterar={alterar} erros={errosVisiveis(0)} opcoes={opcoes.data} />,
          },
          {
            titulo: ETAPAS[1]!,
            conteudo: <EtapaProblema form={form} alterar={alterar} erros={errosVisiveis(1)} obrigatorio={!rascunho} />,
          },
          {
            titulo: ETAPAS[2]!,
            conteudo: (
              <EtapaAcoes
                acoes={form.acoes}
                onAlterar={(acoes) => alterar({ acoes })}
                fimEstimado={form.data_fim_estimado}
                prioridadePadrao={form.prioridade}
                erros={errosVisiveis(2)}
              />
            ),
          },
        ].map((s, i) => ({ ...s, pendente: pendente[i], comErro: mostrarErros[i] }))}
        rodape={
          <>
            <Button onClick={() => navigate("/planos")} disabled={criar.isPending}>
              Cancelar
            </Button>
            <Button onClick={() => salvarRascunho((id) => navigate(`/planos/${id}`))} disabled={criar.isPending}>
              Salvar rascunho
            </Button>
            <span className={styles.espaco} />
            {criar.isError && (
              <span className={styles.erroSalvar} role="alert">
                Não foi possível salvar: {criar.error.message}
              </span>
            )}
            {!criar.isError && etapasComErro.length > 0 && (
              <span className={styles.erroSalvar} role="alert">
                Faltam campos obrigatórios em: {etapasComErro.join(", ")}.
              </span>
            )}
            {abas && etapa > 0 && (
              <Button onClick={() => irPara(etapa - 1)} disabled={criar.isPending}>
                Anterior
              </Button>
            )}
            {mostrarSalvar ? (
              <Button variante="primaria" onClick={salvarPlano} disabled={criar.isPending}>
                {criar.isPending ? "Salvando…" : "Salvar Plano"}
              </Button>
            ) : (
              <Button variante="primaria" onClick={() => irPara(etapa + 1)}>
                Próximo
              </Button>
            )}
          </>
        }
      />

      <Modal
        aberto={blocker.state === "blocked"}
        titulo="Sair sem salvar?"
        onFechar={() => blocker.reset?.()}
        acoes={
          <>
            <Button onClick={() => blocker.reset?.()}>
              Continuar editando
            </Button>
            <Button variante="perigo" onClick={() => blocker.proceed?.()}>
              Descartar
            </Button>
            <Button
              variante="primaria"
              disabled={!etapa1Valida || criar.isPending}
              onClick={() => gravar(true, () => blocker.proceed?.())}
            >
              {criar.isPending ? "Salvando…" : "Salvar como rascunho"}
            </Button>
          </>
        }
      >
        <p>Você preencheu dados que ainda não foram salvos.</p>
        {etapa1Valida ? (
          acoesDescartadas > 0 && (
            <p>
              {acoesDescartadas === 1 ? "1 ação incompleta não será salva" : `${acoesDescartadas} ações incompletas não serão salvas`} no
              rascunho.
            </p>
          )
        ) : (
          <p>Para salvar como rascunho, complete a etapa de Identificação.</p>
        )}
        {criar.isError && <p className={styles.erroSalvar}>Não foi possível salvar: {criar.error.message}</p>}
      </Modal>
    </div>
  );
}
