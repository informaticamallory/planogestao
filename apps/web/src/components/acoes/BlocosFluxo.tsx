/** Blocos do fluxo de aceite e solicitação de alteração de datas (início e/ou conclusão). */
import type { AcaoDetalhe, ContrapropostaResumo, SolicitacaoResumo } from "@planogestao/shared-types";
import { useState } from "react";

import {
  useAceitarAcao,
  useContrapor,
  useResponderContraproposta,
  useResponderSolicitacao,
  useSolicitarAlteracao,
} from "../../hooks/useAcao";
import { formatarData, paraIsoData } from "../../utils/datas";
import {
  ROTULO_CONTRAPROPOSTA,
  ROTULO_SITUACAO,
  alertaContraproposta,
  alertaSolicitacao,
  alvoSolicitacao,
  comoPedido,
  comparacaoContraproposta,
  formatarMomento,
  mudancasSolicitacao,
  resumoMudancas,
  tituloSolicitacao,
} from "../../utils/solicitacaoDatas";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Field, fieldAria } from "../ui/Field";
import { Input, Textarea } from "../ui/Input";
import styles from "./Acao.module.css";

export function FormSolicitacao({ acao, onFechar }: { acao: AcaoDetalhe; onFechar: () => void }) {
  const [inicio, setInicio] = useState("");
  const [conclusao, setConclusao] = useState("");
  const [motivo, setMotivo] = useState("");
  const [tentou, setTentou] = useState(false);
  const solicitar = useSolicitarAlteracao(acao.id);
  const hoje = paraIsoData(new Date());

  // Só conta o que muda: em branco ou igual à vigente = mantém.
  const alteraInicio = !!inicio && inicio !== acao.prazo_inicio;
  const alteraConclusao = !!conclusao && conclusao !== acao.prazo;
  const inicioFinal = alteraInicio ? inicio : acao.prazo_inicio;
  const conclusaoFinal = alteraConclusao ? conclusao : acao.prazo;

  const erros: Record<string, string> = {};
  if (!alteraInicio && !alteraConclusao) erros.geral = "Informe uma nova data de início ou de conclusão diferente da atual.";
  if (alteraConclusao && conclusao < hoje) erros.conclusao = "A data de conclusão solicitada não pode estar no passado.";
  else if (inicioFinal && inicioFinal > conclusaoFinal)
    erros[alteraInicio ? "inicio" : "conclusao"] = "A data de início não pode ser posterior à data de conclusão.";
  if (motivo.trim().length < 5) erros.motivo = "Explique o motivo (mínimo 5 caracteres).";
  const visiveis = tentou ? erros : {};

  const enviar = () => {
    setTentou(true);
    if (Object.keys(erros).length) return;
    solicitar.mutate(
      {
        novo_prazo_inicio_sugerido: alteraInicio ? inicio : null,
        novo_prazo_sugerido: alteraConclusao ? conclusao : null,
        motivo: motivo.trim(),
      },
      { onSuccess: onFechar },
    );
  };

  return (
    <div className={styles.formSolicitacao}>
      <p className={styles.textoApoio}>
        Preencha só as datas que devem mudar; as demais ficam como estão. O gestor do plano será notificado e poderá aprovar ou recusar.
        Até a resposta, as datas atuais continuam valendo.
      </p>
      <div className={styles.linhaCampos}>
        <Field
          id="novo-inicio"
          rotulo="Nova data de início"
          erro={visiveis.inicio}
          ajuda={`Prazo inicial estimado. Atual: ${acao.prazo_inicio ? formatarData(acao.prazo_inicio) : "não definido"}.`}
        >
          <Input {...fieldAria("novo-inicio", visiveis.inicio)} type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
        </Field>
        <Field
          id="nova-conclusao"
          rotulo="Nova data de conclusão"
          erro={visiveis.conclusao}
          ajuda={`Prazo de conclusão. Atual: ${formatarData(acao.prazo)}.`}
          aviso={
            alteraConclusao && conclusao > acao.plano.data_fim_estimado
              ? `Ultrapassa o término estimado do plano, em ${formatarData(acao.plano.data_fim_estimado)}.`
              : null
          }
        >
          <Input
            {...fieldAria("nova-conclusao", visiveis.conclusao)}
            type="date"
            min={hoje}
            value={conclusao}
            onChange={(e) => setConclusao(e.target.value)}
          />
        </Field>
      </div>
      {visiveis.geral && <p className={styles.erro}>{visiveis.geral}</p>}
      <Field id="motivo" rotulo="Justificativa" obrigatorio erro={visiveis.motivo}>
        <Textarea {...fieldAria("motivo", visiveis.motivo)} rows={3} maxLength={1000} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </Field>
      {solicitar.isError && <p className={styles.erro}>{solicitar.error.message}</p>}
      <div className={styles.botoes}>
        <Button onClick={onFechar}>Cancelar</Button>
        <Button variante="primaria" onClick={enviar} disabled={solicitar.isPending}>
          {solicitar.isPending ? "Enviando…" : "Enviar solicitação"}
        </Button>
      </div>
    </div>
  );
}

/** A mudança em destaque: "De: 30/10/2026 → Para: 05/11/2026", uma linha por data (com o nome dela só se forem duas). */
function MudancasSolicitacao({ s }: { s: SolicitacaoResumo }) {
  const linhas = mudancasSolicitacao(s);
  return (
    <ul className={styles.mudancas}>
      {linhas.map((l) => (
        <li key={l.rotulo}>
          {linhas.length > 1 && <span className={styles.rotuloMudanca}>{l.rotulo}</span>}
          <span>
            De: {l.de} → Para: <strong>{l.para}</strong>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A data do pedido é informação secundária: vai no rodapé, para não se confundir com as datas da ação. */
function PedidoEnviado({ s }: { s: SolicitacaoResumo }) {
  return <p className={styles.notaPedido}>Pedido enviado em {formatarMomento(s.criado_em)}.</p>;
}

/** Para o responsável, enquanto a ação aguarda aceite. */
export function BlocoAceite({ acao }: { acao: AcaoDetalhe }) {
  const [solicitando, setSolicitando] = useState(false);
  const aceitar = useAceitarAcao(acao.id);
  const pendente = acao.solicitacao_pendente;

  return (
    <section className={`${styles.bloco} ${styles.blocoDestaque}`} aria-labelledby="titulo-aceite">
      <h2 id="titulo-aceite" className={styles.tituloBloco}>
        Nova ação atribuída a você
      </h2>
      {pendente ? (
        <>
          <p className={styles.textoApoio} role="status">
            {pendente.contraproposta_pendente
              ? "O gestor sugeriu outra data para o seu pedido: responda à contraproposta abaixo. Ao aceitá-la, a ação é aceita automaticamente."
              : `Você solicitou mudar ${alvoSolicitacao(pendente)} da ação. Aguardando resposta do gestor — se aprovada, a ação é aceita automaticamente.`}
          </p>
          {!pendente.contraproposta_pendente && (
            <>
              <MudancasSolicitacao s={pendente} />
              <PedidoEnviado s={pendente} />
            </>
          )}
        </>
      ) : solicitando ? (
        <FormSolicitacao acao={acao} onFechar={() => setSolicitando(false)} />
      ) : (
        <>
          <p className={styles.textoApoio}>
            Prazo: <strong>{formatarData(acao.prazo)}</strong>. Aceite a ação ou proponha outras datas.
          </p>
          {aceitar.isError && <p className={styles.erro}>{aceitar.error.message}</p>}
          <div className={styles.botoes}>
            <Button variante="primaria" onClick={() => aceitar.mutate()} disabled={aceitar.isPending}>
              <Icon name="check" size={16} />
              {aceitar.isPending ? "Aceitando…" : "Aceitar"}
            </Button>
            <Button onClick={() => setSolicitando(true)}>
              <Icon name="refresh" size={16} />
              Solicitar alteração
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

/** Vigente × solicitada × proposta pelo gestor, só das datas negociadas. */
function TabelaComparacao({ s, c, legenda }: { s: SolicitacaoResumo; c: ContrapropostaResumo; legenda: string }) {
  return (
    <div className={styles.rolagemTabela}>
      <table className={styles.tabelaDatas}>
        <caption className="sr-only">{legenda}</caption>
        <thead>
          <tr>
            <th scope="col">Data</th>
            <th scope="col">Vigente</th>
            <th scope="col">Solicitada</th>
            <th scope="col">Contraproposta</th>
          </tr>
        </thead>
        <tbody>
          {comparacaoContraproposta(s, c).map((l) => (
            <tr key={l.campo}>
              <th scope="row">{l.campo}</th>
              <td data-rotulo="Vigente">{l.vigente}</td>
              <td data-rotulo="Solicitada">{l.solicitada}</td>
              <td data-rotulo="Contraproposta" className={styles.destaqueProposta}>
                {l.proposta}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Contrapropostas já respondidas, substituídas ou encerradas (a pendente aparece à parte). */
function HistoricoNegociacao({ s }: { s: SolicitacaoResumo }) {
  const anteriores = s.contrapropostas.filter((c) => c.status !== "pendente");
  if (anteriores.length === 0) return null;
  return (
    <details>
      <summary className={styles.subtituloBloco}>Histórico da negociação ({anteriores.length})</summary>
      <ul className={styles.listaNegociacao}>
        {anteriores.map((c) => (
          <li key={c.id} className={styles.caixaNegociacao}>
            <span className={styles.statusSolicitacao}>Contraproposta {ROTULO_CONTRAPROPOSTA[c.status].toLowerCase()}</span>
            <span className={styles.textoApoio}>
              {c.proposto_por.nome}, {formatarMomento(c.criado_em)} — {resumoMudancas(comoPedido(c))}
            </span>
            <span>“{c.justificativa}”</span>
            {c.resposta_justificativa && (
              <span className={styles.textoApoio}>
                Resposta de {s.solicitado_por.nome}: “{c.resposta_justificativa}”
              </span>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Gestor: outras datas (em branco = mantém a vigente) + justificativa obrigatória. */
function FormContraproposta({ acao, s, onFechar }: { acao: AcaoDetalhe; s: SolicitacaoResumo; onFechar: () => void }) {
  // Começa do que foi pedido: o gestor ajusta só o que quer mudar.
  const [inicio, setInicio] = useState(s.altera_inicio ? (s.novo_prazo_inicio_sugerido ?? "") : "");
  const [conclusao, setConclusao] = useState(s.altera_conclusao ? s.novo_prazo_sugerido : "");
  const [justificativa, setJustificativa] = useState("");
  const [tentou, setTentou] = useState(false);
  const contrapor = useContrapor(acao.id);
  const hoje = paraIsoData(new Date());

  const alteraInicio = !!inicio && inicio !== acao.prazo_inicio;
  const alteraConclusao = !!conclusao && conclusao !== acao.prazo;
  const inicioFinal = alteraInicio ? inicio : acao.prazo_inicio;
  const conclusaoFinal = alteraConclusao ? conclusao : acao.prazo;
  const pedidoInicio = s.altera_inicio ? s.novo_prazo_inicio_sugerido : acao.prazo_inicio;
  const pedidoConclusao = s.altera_conclusao ? s.novo_prazo_sugerido : acao.prazo;

  const erros: Record<string, string> = {};
  if (!alteraInicio && !alteraConclusao) erros.geral = "Proponha uma data de início ou de conclusão diferente da vigente.";
  else if (inicioFinal === pedidoInicio && conclusaoFinal === pedidoConclusao)
    erros.geral = "As datas propostas são iguais às solicitadas: use “Aceitar alteração”.";
  if (alteraConclusao && conclusao < hoje) erros.conclusao = "A data de conclusão proposta não pode estar no passado.";
  else if (inicioFinal && inicioFinal > conclusaoFinal)
    erros[alteraInicio ? "inicio" : "conclusao"] = "A data de início não pode ser posterior à data de conclusão.";
  if (justificativa.trim().length < 5) erros.justificativa = "Explique a contraproposta (mínimo 5 caracteres).";
  const visiveis = tentou ? erros : {};

  const enviar = () => {
    setTentou(true);
    if (Object.keys(erros).length) return;
    contrapor.mutate(
      {
        solicitacaoId: s.id,
        novo_prazo_inicio: alteraInicio ? inicio : null,
        novo_prazo: alteraConclusao ? conclusao : null,
        justificativa: justificativa.trim(),
      },
      { onSuccess: onFechar },
    );
  };

  return (
    <div className={`${styles.formSolicitacao} ${styles.caixaNegociacao}`}>
      <h3 className={styles.subtituloBloco}>Sugerir outra data</h3>
      <dl className={styles.datasSolicitacao}>
        <dt>Datas vigentes</dt>
        <dd>
          Início {acao.prazo_inicio ? formatarData(acao.prazo_inicio) : "—"} · Conclusão {formatarData(acao.prazo)}
        </dd>
        <dt>Datas solicitadas</dt>
        <dd>{resumoMudancas(s)}</dd>
      </dl>
      <div className={styles.linhaCampos}>
        <Field id="cp-inicio" rotulo="Data de início proposta" erro={visiveis.inicio} ajuda="Prazo inicial estimado. Em branco: mantém a vigente.">
          <Input {...fieldAria("cp-inicio", visiveis.inicio)} type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
        </Field>
        <Field
          id="cp-conclusao"
          rotulo="Data de conclusão proposta"
          erro={visiveis.conclusao}
          ajuda="Prazo de conclusão. Em branco: mantém a vigente."
          aviso={
            alteraConclusao && conclusao > acao.plano.data_fim_estimado
              ? `Ultrapassa o término estimado do plano, em ${formatarData(acao.plano.data_fim_estimado)}.`
              : null
          }
        >
          <Input
            {...fieldAria("cp-conclusao", visiveis.conclusao)}
            type="date"
            min={hoje}
            value={conclusao}
            onChange={(e) => setConclusao(e.target.value)}
          />
        </Field>
      </div>
      {visiveis.geral && <p className={styles.erro}>{visiveis.geral}</p>}
      <Field id="cp-justificativa" rotulo="Justificativa da contraproposta" obrigatorio erro={visiveis.justificativa}>
        <Textarea
          {...fieldAria("cp-justificativa", visiveis.justificativa)}
          rows={3}
          maxLength={1000}
          value={justificativa}
          onChange={(e) => setJustificativa(e.target.value)}
        />
      </Field>
      <p className={styles.textoApoio}>As datas vigentes não mudam até o responsável aceitar a contraproposta.</p>
      {contrapor.isError && <p className={styles.erro}>{contrapor.error.message}</p>}
      <div className={styles.botoes}>
        <Button onClick={onFechar}>Cancelar</Button>
        <Button variante="primaria" onClick={enviar} disabled={contrapor.isPending}>
          {contrapor.isPending ? "Enviando…" : "Enviar contraproposta"}
        </Button>
      </div>
    </div>
  );
}

/** Para quem avalia (gestor do plano, criador, responsável pelo item acima ou quem aprova prazos). */
export function BlocoRespostaSolicitacao({ acao }: { acao: AcaoDetalhe }) {
  const s = acao.solicitacao_pendente!;
  const [justificativa, setJustificativa] = useState("");
  const [contrapondo, setContrapondo] = useState(false);
  const responder = useResponderSolicitacao(acao.id);
  const enviar = (aprovado: boolean) =>
    responder.mutate({ solicitacaoId: s.id, aprovado, justificativa: justificativa.trim() || null });
  const alerta = alertaSolicitacao(s, acao.plano.data_fim_estimado);
  const aguardando = s.contraproposta_pendente;
  // Última contraproposta não aceita (o pedido voltou para o gestor): mostra a resposta do responsável.
  const ultima = s.contrapropostas.at(-1);
  const recusada = !aguardando && ultima?.status === "nao_aceita" ? ultima : null;

  return (
    <section className={`${styles.bloco} ${styles.blocoDestaque}`} aria-labelledby="titulo-solicitacao">
      <div className={styles.cabecalhoSolicitacao}>
        <h2 id="titulo-solicitacao" className={styles.tituloBloco}>
          {tituloSolicitacao(s)}
        </h2>
        <span className={`${styles.seloSituacao} ${styles[`seloSituacao_${s.situacao}`] ?? ""}`} role="status">
          {ROTULO_SITUACAO[s.situacao]}
        </span>
      </div>
      <p>
        <strong>{s.solicitado_por.nome}</strong> solicitou mudar {alvoSolicitacao(s)} {acao.nivel > 0 ? "do sub-item" : "da ação"}:
      </p>
      <MudancasSolicitacao s={s} />
      <p>
        <strong>Justificativa:</strong> {s.motivo}
      </p>
      {alerta && (
        <p className={styles.alertaSolicitacao} role="note">
          {alerta}
        </p>
      )}
      {s.feita_antes_do_aceite && (
        <p className={styles.textoApoio}>Pedido feito antes do aceite: ao aprovar, a ação é aceita automaticamente.</p>
      )}
      <PedidoEnviado s={s} />

      {aguardando && (
        <div className={styles.caixaNegociacao}>
          <p className={styles.textoApoio}>
            Contraproposta enviada por <strong>{aguardando.proposto_por.nome}</strong> em {formatarMomento(aguardando.criado_em)}, aguardando
            resposta de {s.solicitado_por.nome}. Você ainda pode aprovar ou recusar o pedido original, ou substituir a contraproposta.
          </p>
          <TabelaComparacao s={s} c={aguardando} legenda="Datas vigentes, solicitadas e da contraproposta" />
          {alertaContraproposta(aguardando, acao.plano.data_fim_estimado) && (
            <p className={styles.alertaSolicitacao} role="note">
              {alertaContraproposta(aguardando, acao.plano.data_fim_estimado)}
            </p>
          )}
          <span className={styles.textoApoio}>Justificativa: “{aguardando.justificativa}”</span>
        </div>
      )}
      {recusada && (
        <div className={styles.caixaNegociacao}>
          <p className={styles.textoApoio}>
            <strong>{s.solicitado_por.nome}</strong> não aceitou a contraproposta de {recusada.proposto_por.nome}. O pedido voltou para a
            sua análise.
          </p>
          <TabelaComparacao s={s} c={recusada} legenda="Datas da contraproposta não aceita" />
          <span>Resposta: “{recusada.resposta_justificativa}”</span>
        </div>
      )}
      <HistoricoNegociacao s={s} />

      {contrapondo ? (
        <FormContraproposta acao={acao} s={s} onFechar={() => setContrapondo(false)} />
      ) : (
        <>
          <Field id="justificativa" rotulo="Justificativa da resposta (opcional)">
            <Textarea id="justificativa" rows={2} maxLength={1000} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} />
          </Field>
          {responder.isError && <p className={styles.erro}>{responder.error.message}</p>}
          <div className={styles.botoes}>
            <Button variante="primaria" onClick={() => enviar(true)} disabled={responder.isPending}>
              Aceitar alteração
            </Button>
            <Button variante="perigo" onClick={() => enviar(false)} disabled={responder.isPending}>
              Recusar alteração
            </Button>
            <Button onClick={() => setContrapondo(true)} disabled={responder.isPending}>
              <Icon name="calendar" size={16} />
              {aguardando ? "Substituir contraproposta" : "Sugerir outra data"}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

/** Para quem pediu, quando o gestor sugeriu outras datas. */
export function BlocoContraproposta({ acao }: { acao: AcaoDetalhe }) {
  const s = acao.solicitacao_pendente!;
  const c = s.contraproposta_pendente!;
  const [naoAceitando, setNaoAceitando] = useState(false);
  const [justificativa, setJustificativa] = useState("");
  const [tentou, setTentou] = useState(false);
  const responder = useResponderContraproposta(acao.id);
  const alerta = alertaContraproposta(c, acao.plano.data_fim_estimado);
  const erroJustificativa = tentou && justificativa.trim().length < 5 ? "Explique por que não aceita (mínimo 5 caracteres)." : undefined;

  const enviar = (aceita: boolean) => {
    if (!aceita) {
      setTentou(true);
      if (justificativa.trim().length < 5) return;
    }
    responder.mutate({ solicitacaoId: s.id, contrapropostaId: c.id, aceita, justificativa: aceita ? null : justificativa.trim() });
  };

  return (
    <section className={`${styles.bloco} ${styles.blocoDestaque}`} aria-labelledby="titulo-contraproposta">
      <div className={styles.cabecalhoSolicitacao}>
        <h2 id="titulo-contraproposta" className={styles.tituloBloco}>
          Contraproposta de datas
        </h2>
        <span className={`${styles.seloSituacao} ${styles.seloSituacao_aguardando_responsavel}`} role="status">
          Aguardando a sua resposta
        </span>
      </div>
      <p>
        O gestor <strong>{c.proposto_por.nome}</strong> sugeriu outra data para {acao.nivel > 0 ? "este sub-item" : "esta ação"}.
      </p>
      <p className={styles.textoApoio}>Enviada em {formatarMomento(c.criado_em)}. Até a sua resposta, as datas vigentes continuam valendo.</p>
      <TabelaComparacao s={s} c={c} legenda="Datas vigentes, solicitadas por você e da contraproposta" />
      {alerta && (
        <p className={styles.alertaSolicitacao} role="note">
          {alerta}
        </p>
      )}
      <h3 className={styles.subtituloBloco}>Justificativa do gestor</h3>
      <blockquote className={styles.motivo}>{c.justificativa}</blockquote>
      {s.feita_antes_do_aceite && acao.status === "aguardando_aceite" && (
        <p className={styles.textoApoio}>Ao aceitar a contraproposta, a ação também é aceita.</p>
      )}
      <HistoricoNegociacao s={s} />
      {naoAceitando && (
        <Field id="cp-resposta" rotulo="Por que não aceita?" obrigatorio erro={erroJustificativa} ajuda="O gestor vê esta resposta e decide o pedido de novo.">
          <Textarea
            {...fieldAria("cp-resposta", erroJustificativa)}
            rows={3}
            maxLength={1000}
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
          />
        </Field>
      )}
      {responder.isError && <p className={styles.erro}>{responder.error.message}</p>}
      <div className={styles.botoes}>
        {naoAceitando ? (
          <>
            <Button onClick={() => setNaoAceitando(false)} disabled={responder.isPending}>
              Cancelar
            </Button>
            <Button variante="perigo" onClick={() => enviar(false)} disabled={responder.isPending}>
              {responder.isPending ? "Enviando…" : "Enviar resposta"}
            </Button>
          </>
        ) : (
          <>
            <Button variante="primaria" onClick={() => enviar(true)} disabled={responder.isPending}>
              <Icon name="check" size={16} />
              {responder.isPending ? "Enviando…" : "Aceitar contraproposta"}
            </Button>
            <Button onClick={() => setNaoAceitando(true)} disabled={responder.isPending}>
              Não aceitar
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
