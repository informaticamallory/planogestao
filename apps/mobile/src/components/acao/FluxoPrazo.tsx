/** Aceite e solicitação de alteração de datas (mesmas regras do web; quem decide é o backend). */
import type { AcaoDetalhe, ContrapropostaResumo, SolicitacaoResumo } from "@planogestao/shared-types";
import { useState } from "react";
import { Text, View } from "react-native";

import { mensagemDeErro } from "../../hooks/useAuth";
import {
  useAceitarAcao,
  useContrapor,
  useResponderContraproposta,
  useResponderSolicitacao,
  useSolicitarAlteracao,
} from "../../hooks/useAcao";
import { cores, escalarTexto, espaco, estilosDinamicos, fonte, raio } from "../../theme";
import { formatarData, paraIsoData } from "../../utils/formatos";
import {
  ROTULO_SITUACAO,
  alertaContraproposta,
  alertaSolicitacao,
  camposSolicitacao,
  comparacaoContraproposta,
  formatarMomento,
  linhasSolicitacao,
  resumoMudancas,
} from "../../utils/solicitacaoDatas";
import { Botao } from "../Botao";
import { CampoData, CampoTexto } from "../Campos";
import { FolhaInferior } from "../FolhaInferior";

export function ErroAcao({ erro }: { erro: unknown }) {
  return <ErroTexto texto={mensagemDeErro(erro)} />;
}

function ErroTexto({ texto }: { texto: string }) {
  return (
    <Text style={estilos.erro} accessibilityRole="alert">
      {texto}
    </Text>
  );
}

/** Datas atuais e solicitadas (só as pedidas), com o horário do pedido. */
function DatasSolicitacao({ s }: { s: SolicitacaoResumo }) {
  return (
    <View style={estilos.datas}>
      {[{ rotulo: "Solicitado em", valor: formatarMomento(s.criado_em) }, ...linhasSolicitacao(s)].map((l) => (
        <Text key={l.rotulo} style={estilos.apoio}>
          {l.rotulo}: <Text style={estilos.forte}>{l.valor}</Text>
        </Text>
      ))}
    </View>
  );
}

/** Bottom sheet: nova data de início e/ou de conclusão (seletor nativo) + justificativa. */
export function FolhaSolicitacao({ acao, visivel, onFechar }: { acao: AcaoDetalhe; visivel: boolean; onFechar: () => void }) {
  const [inicio, setInicio] = useState<string | null>(null);
  const [conclusao, setConclusao] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [tentou, setTentou] = useState(false);
  const solicitar = useSolicitarAlteracao(acao.id);
  const hoje = paraIsoData(new Date());

  // Só conta o que muda (sem escolha ou igual à vigente = mantém). A regra definitiva é do servidor.
  const alteraInicio = !!inicio && inicio !== acao.prazo_inicio;
  const alteraConclusao = !!conclusao && conclusao !== acao.prazo;
  const inicioFinal = alteraInicio ? inicio : acao.prazo_inicio;
  const conclusaoFinal = alteraConclusao ? conclusao! : acao.prazo;
  const erros: { geral?: string; inicio?: string; conclusao?: string; motivo?: string } = {};
  if (!alteraInicio && !alteraConclusao) erros.geral = "Escolha uma nova data de início ou de conclusão diferente da atual.";
  if (alteraConclusao && conclusao! < hoje) erros.conclusao = "A data de conclusão solicitada não pode estar no passado.";
  else if (inicioFinal && inicioFinal > conclusaoFinal)
    erros[alteraInicio ? "inicio" : "conclusao"] = "A data de início não pode ser posterior à data de conclusão.";
  if (motivo.trim().length < 5) erros.motivo = "Explique o motivo (mínimo 5 caracteres).";
  const visiveis = tentou ? erros : {};

  const fechar = () => {
    setInicio(null);
    setConclusao(null);
    setMotivo("");
    setTentou(false);
    solicitar.reset();
    onFechar();
  };

  const enviar = () => {
    setTentou(true);
    if (Object.keys(erros).length) return;
    solicitar.mutate(
      {
        novo_prazo_inicio_sugerido: alteraInicio ? inicio : null,
        novo_prazo_sugerido: alteraConclusao ? conclusao : null,
        motivo: motivo.trim(),
      },
      { onSuccess: fechar },
    );
  };

  return (
    <FolhaInferior visivel={visivel} titulo="Solicitar alteração de datas" onFechar={fechar}>
      <Text style={estilos.apoio}>
        Escolha só as datas que devem mudar; as demais ficam como estão. O gestor do plano será notificado e poderá aprovar ou recusar.
        {acao.status === "aguardando_aceite" && " Se aprovada, a ação é aceita automaticamente."}
      </Text>
      <CampoData
        rotulo="Nova data de início"
        valor={inicio}
        onAlterar={setInicio}
        erro={visiveis.inicio}
        ajuda={`Prazo inicial estimado. Atual: ${acao.prazo_inicio ? formatarData(acao.prazo_inicio) : "não definido"}.`}
      />
      <CampoData
        rotulo="Nova data de conclusão"
        valor={conclusao}
        onAlterar={setConclusao}
        minimo={hoje}
        erro={visiveis.conclusao}
        ajuda={
          alteraConclusao && conclusao! > acao.plano.data_fim_estimado
            ? `Ultrapassa o término estimado do plano, em ${formatarData(acao.plano.data_fim_estimado)}.`
            : `Prazo de conclusão. Atual: ${formatarData(acao.prazo)}.`
        }
      />
      {visiveis.geral && <ErroTexto texto={visiveis.geral} />}
      <CampoTexto
        rotulo="Justificativa"
        obrigatorio
        multiline
        maxLength={1000}
        value={motivo}
        onChangeText={setMotivo}
        placeholder="Por que as datas precisam mudar?"
        erro={visiveis.motivo}
      />
      {solicitar.isError && <ErroAcao erro={solicitar.error} />}
      <View style={estilos.linhaBotoes}>
        <Botao texto="Cancelar" onPress={fechar} flex />
        <Botao texto="Enviar" variante="primaria" icone="refresh" onPress={enviar} carregando={solicitar.isPending} flex />
      </View>
    </FolhaInferior>
  );
}

/** Responsável, com a ação aguardando aceite. */
export function BlocoAceite({ acao }: { acao: AcaoDetalhe }) {
  const [solicitando, setSolicitando] = useState(false);
  const aceitar = useAceitarAcao(acao.id);
  const pendente = acao.solicitacao_pendente;

  return (
    <View style={[estilos.bloco, estilos.destaque]}>
      <Text style={estilos.titulo} accessibilityRole="header">
        Nova ação atribuída a você
      </Text>
      {pendente ? (
        <>
          <Text style={estilos.apoio} accessibilityRole="text">
            {pendente.contraproposta_pendente
              ? "O gestor sugeriu outra data para o seu pedido: responda à contraproposta abaixo. Ao aceitá-la, a ação é aceita automaticamente."
              : `Você solicitou a alteração ${camposSolicitacao(pendente)}. Aguardando resposta do gestor — se aprovada, a ação é aceita automaticamente.`}
          </Text>
          {!pendente.contraproposta_pendente && <DatasSolicitacao s={pendente} />}
        </>
      ) : (
        <>
          <Text style={estilos.apoio}>
            Prazo de conclusão: <Text style={estilos.forte}>{formatarData(acao.prazo)}</Text>. Aceite a ação ou proponha outras datas.
          </Text>
          {aceitar.isError && <ErroAcao erro={aceitar.error} />}
          <Botao texto="Aceitar" variante="primaria" icone="checkCircle" onPress={() => aceitar.mutate()} carregando={aceitar.isPending} />
          <Botao texto="Solicitar alteração" icone="calendar" onPress={() => setSolicitando(true)} desabilitado={aceitar.isPending} />
          <FolhaSolicitacao acao={acao} visivel={solicitando} onFechar={() => setSolicitando(false)} />
        </>
      )}
    </View>
  );
}

/** Vigente × solicitada × proposta pelo gestor, uma linha por data negociada. */
function ComparacaoDatas({ s, c }: { s: SolicitacaoResumo; c: ContrapropostaResumo }) {
  return (
    <View style={estilos.caixa}>
      {comparacaoContraproposta(s, c).map((l) => (
        <View key={l.campo} style={estilos.datas}>
          <Text style={estilos.forte}>{l.campo}</Text>
          <Text style={estilos.apoio}>
            Vigente: <Text style={estilos.forte}>{l.vigente}</Text> · Solicitada: <Text style={estilos.forte}>{l.solicitada}</Text>
          </Text>
          <Text style={estilos.apoio}>
            Contraproposta: <Text style={estilos.forte}>{l.proposta}</Text>
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Gestor: outras datas (começa do que foi pedido) + justificativa obrigatória. */
function FolhaContraproposta({ acao, s, visivel, onFechar }: { acao: AcaoDetalhe; s: SolicitacaoResumo; visivel: boolean; onFechar: () => void }) {
  const [inicio, setInicio] = useState<string | null>(s.altera_inicio ? (s.novo_prazo_inicio_sugerido ?? null) : null);
  const [conclusao, setConclusao] = useState<string | null>(s.altera_conclusao ? s.novo_prazo_sugerido : null);
  const [justificativa, setJustificativa] = useState("");
  const [tentou, setTentou] = useState(false);
  const contrapor = useContrapor(acao.id);
  const hoje = paraIsoData(new Date());

  const alteraInicio = !!inicio && inicio !== acao.prazo_inicio;
  const alteraConclusao = !!conclusao && conclusao !== acao.prazo;
  const inicioFinal = alteraInicio ? inicio : acao.prazo_inicio;
  const conclusaoFinal = alteraConclusao ? conclusao! : acao.prazo;
  const pedidoInicio = s.altera_inicio ? s.novo_prazo_inicio_sugerido : acao.prazo_inicio;
  const pedidoConclusao = s.altera_conclusao ? s.novo_prazo_sugerido : acao.prazo;
  const erros: { geral?: string; inicio?: string; conclusao?: string; justificativa?: string } = {};
  if (!alteraInicio && !alteraConclusao) erros.geral = "Proponha uma data de início ou de conclusão diferente da vigente.";
  else if (inicioFinal === pedidoInicio && conclusaoFinal === pedidoConclusao)
    erros.geral = "As datas propostas são iguais às solicitadas: use “Aceitar alteração”.";
  if (alteraConclusao && conclusao! < hoje) erros.conclusao = "A data de conclusão proposta não pode estar no passado.";
  else if (inicioFinal && inicioFinal > conclusaoFinal)
    erros[alteraInicio ? "inicio" : "conclusao"] = "A data de início não pode ser posterior à data de conclusão.";
  if (justificativa.trim().length < 5) erros.justificativa = "Explique a contraproposta (mínimo 5 caracteres).";
  const visiveis = tentou ? erros : {};

  const fechar = () => {
    setTentou(false);
    setJustificativa("");
    contrapor.reset();
    onFechar();
  };
  const enviar = () => {
    setTentou(true);
    if (Object.keys(erros).length) return;
    contrapor.mutate(
      { solicitacaoId: s.id, novo_prazo_inicio: alteraInicio ? inicio : null, novo_prazo: alteraConclusao ? conclusao : null,
        justificativa: justificativa.trim() },
      { onSuccess: fechar },
    );
  };

  return (
    <FolhaInferior visivel={visivel} titulo="Sugerir outra data" onFechar={fechar}>
      <Text style={estilos.apoio}>
        Vigentes: início <Text style={estilos.forte}>{acao.prazo_inicio ? formatarData(acao.prazo_inicio) : "—"}</Text> · conclusão{" "}
        <Text style={estilos.forte}>{formatarData(acao.prazo)}</Text>
      </Text>
      <Text style={estilos.apoio}>Solicitadas: {resumoMudancas(s)}</Text>
      <CampoData
        rotulo="Data de início proposta"
        valor={inicio}
        onAlterar={setInicio}
        erro={visiveis.inicio}
        ajuda="Prazo inicial estimado. Igual à vigente: não muda."
      />
      <CampoData
        rotulo="Data de conclusão proposta"
        valor={conclusao}
        onAlterar={setConclusao}
        minimo={hoje}
        erro={visiveis.conclusao}
        ajuda={
          alteraConclusao && conclusao! > acao.plano.data_fim_estimado
            ? `Ultrapassa o término estimado do plano, em ${formatarData(acao.plano.data_fim_estimado)}.`
            : "Prazo de conclusão. Igual à vigente: não muda."
        }
      />
      {visiveis.geral && <ErroTexto texto={visiveis.geral} />}
      <CampoTexto
        rotulo="Justificativa da contraproposta"
        obrigatorio
        multiline
        maxLength={1000}
        value={justificativa}
        onChangeText={setJustificativa}
        placeholder="Por que estas datas?"
        erro={visiveis.justificativa}
      />
      <Text style={estilos.apoio}>As datas vigentes não mudam até o responsável aceitar.</Text>
      {contrapor.isError && <ErroAcao erro={contrapor.error} />}
      <View style={estilos.linhaBotoes}>
        <Botao texto="Cancelar" onPress={fechar} flex />
        <Botao texto="Enviar contraproposta" variante="primaria" icone="calendar" onPress={enviar} carregando={contrapor.isPending} flex />
      </View>
    </FolhaInferior>
  );
}

/** Quem pediu, quando o gestor sugeriu outras datas. */
export function BlocoContraproposta({ acao }: { acao: AcaoDetalhe }) {
  const s = acao.solicitacao_pendente!;
  const c = s.contraproposta_pendente!;
  const [naoAceitando, setNaoAceitando] = useState(false);
  const [justificativa, setJustificativa] = useState("");
  const [tentou, setTentou] = useState(false);
  const responder = useResponderContraproposta(acao.id);
  const alerta = alertaContraproposta(c, acao.plano.data_fim_estimado);
  const erro = tentou && justificativa.trim().length < 5 ? "Explique por que não aceita (mínimo 5 caracteres)." : null;

  const fechar = () => {
    setNaoAceitando(false);
    setJustificativa("");
    setTentou(false);
    responder.reset();
  };
  const enviar = (aceita: boolean) => {
    if (!aceita) {
      setTentou(true);
      if (justificativa.trim().length < 5) return;
    }
    responder.mutate(
      { solicitacaoId: s.id, contrapropostaId: c.id, aceita, justificativa: aceita ? null : justificativa.trim() },
      { onSuccess: fechar },
    );
  };

  return (
    <View style={[estilos.bloco, estilos.destaque]}>
      <Text style={estilos.titulo} accessibilityRole="header">
        Contraproposta de datas
      </Text>
      <Text style={estilos.apoio}>
        O gestor <Text style={estilos.forte}>{c.proposto_por.nome}</Text> sugeriu outra data para {acao.nivel > 0 ? "este sub-item" : "esta ação"}.
      </Text>
      <ComparacaoDatas s={s} c={c} />
      {alerta && <Text style={estilos.alerta}>{alerta}</Text>}
      <Text style={estilos.subtitulo}>Justificativa do gestor</Text>
      <Text style={estilos.motivo}>{c.justificativa}</Text>
      {s.feita_antes_do_aceite && acao.status === "aguardando_aceite" && (
        <Text style={estilos.apoio}>Ao aceitar a contraproposta, a ação também é aceita.</Text>
      )}
      {responder.isError && !naoAceitando && <ErroAcao erro={responder.error} />}
      <Botao
        texto="Aceitar contraproposta"
        variante="sucesso"
        icone="checkCircle"
        onPress={() => enviar(true)}
        carregando={responder.isPending && responder.variables?.aceita === true}
        desabilitado={responder.isPending}
      />
      <Botao texto="Não aceitar" icone="alert" onPress={() => setNaoAceitando(true)} desabilitado={responder.isPending} />

      <FolhaInferior visivel={naoAceitando} titulo="Não aceitar a contraproposta" onFechar={fechar}>
        <CampoTexto
          rotulo="Por que não aceita?"
          obrigatorio
          multiline
          maxLength={1000}
          value={justificativa}
          onChangeText={setJustificativa}
          placeholder="O gestor vê esta resposta e decide o pedido de novo"
          erro={erro}
        />
        {responder.isError && <ErroAcao erro={responder.error} />}
        <View style={estilos.linhaBotoes}>
          <Botao texto="Cancelar" onPress={fechar} flex />
          <Botao texto="Enviar resposta" variante="perigo" onPress={() => enviar(false)} carregando={responder.isPending} flex />
        </View>
      </FolhaInferior>
    </View>
  );
}

/** Gestor/criador do plano, com solicitação pendente feita por outra pessoa. */
export function BlocoRespostaSolicitacao({ acao }: { acao: AcaoDetalhe }) {
  const s = acao.solicitacao_pendente!;
  const [aberto, setAberto] = useState(false);
  const [contrapondo, setContrapondo] = useState(false);
  const [justificativa, setJustificativa] = useState("");
  const responder = useResponderSolicitacao(acao.id);
  const alerta = alertaSolicitacao(s, acao.plano.data_fim_estimado);
  const aguardando = s.contraproposta_pendente;
  const ultima = s.contrapropostas.at(-1);
  const recusada = !aguardando && ultima?.status === "nao_aceita" ? ultima : null;

  const fechar = () => {
    setAberto(false);
    setJustificativa("");
    responder.reset();
  };
  const enviar = (aprovado: boolean) =>
    responder.mutate({ solicitacaoId: s.id, aprovado, justificativa: justificativa.trim() || null }, { onSuccess: fechar });

  const resumo = (
    <>
      <Text style={estilos.apoio}>
        <Text style={estilos.forte}>{s.solicitado_por.nome}</Text> solicitou a alteração {camposSolicitacao(s)}.
      </Text>
      <DatasSolicitacao s={s} />
      <Text style={estilos.subtitulo}>Justificativa</Text>
      <Text style={estilos.motivo}>{s.motivo}</Text>
      {alerta && (
        <Text style={estilos.alerta} accessibilityRole="text">
          {alerta}
        </Text>
      )}
      {s.feita_antes_do_aceite && <Text style={estilos.apoio}>Pedido feito antes do aceite: ao aprovar, a ação é aceita automaticamente.</Text>}
      {aguardando && (
        <>
          <Text style={estilos.apoio}>
            Contraproposta de <Text style={estilos.forte}>{aguardando.proposto_por.nome}</Text>, aguardando resposta de {s.solicitado_por.nome}:
          </Text>
          <ComparacaoDatas s={s} c={aguardando} />
        </>
      )}
      {recusada && (
        <>
          <Text style={estilos.apoio}>
            <Text style={estilos.forte}>{s.solicitado_por.nome}</Text> não aceitou a contraproposta. O pedido voltou para a sua análise.
          </Text>
          <ComparacaoDatas s={s} c={recusada} />
          <Text style={estilos.motivo}>Resposta: {recusada.resposta_justificativa}</Text>
        </>
      )}
    </>
  );

  return (
    <View style={[estilos.bloco, estilos.destaque]}>
      <Text style={estilos.titulo} accessibilityRole="header">
        Solicitação de alteração de datas
      </Text>
      <Text style={[estilos.apoio, estilos.forte]}>{ROTULO_SITUACAO[s.situacao]}</Text>
      {resumo}
      <Botao texto="Responder solicitação" variante="primaria" icone="userCheck" onPress={() => setAberto(true)} />
      <Botao texto={aguardando ? "Substituir contraproposta" : "Sugerir outra data"} icone="calendar" onPress={() => setContrapondo(true)} />
      <FolhaContraproposta acao={acao} s={s} visivel={contrapondo} onFechar={() => setContrapondo(false)} />

      <FolhaInferior visivel={aberto} titulo="Responder solicitação" onFechar={fechar}>
        {resumo}
        <CampoTexto
          rotulo="Justificativa (opcional)"
          multiline
          maxLength={1000}
          value={justificativa}
          onChangeText={setJustificativa}
          placeholder="Aparece para quem pediu"
        />
        {responder.isError && <ErroAcao erro={responder.error} />}
        <Botao
          texto="Aceitar alteração"
          variante="sucesso"
          icone="checkCircle"
          onPress={() => enviar(true)}
          carregando={responder.isPending && responder.variables?.aprovado === true}
          desabilitado={responder.isPending}
        />
        <Botao
          texto="Recusar alteração"
          variante="perigo"
          icone="alert"
          onPress={() => enviar(false)}
          carregando={responder.isPending && responder.variables?.aprovado === false}
          desabilitado={responder.isPending}
        />
      </FolhaInferior>
    </View>
  );
}

export const estilos = estilosDinamicos(() => ({
  bloco: { gap: espaco[3], padding: espaco[4], borderWidth: 1, borderColor: cores.borda, borderRadius: raio.lg, backgroundColor: cores.superficie },
  destaque: { borderColor: cores.primaria, borderWidth: 1.5, backgroundColor: cores.primariaSuave },
  titulo: { fontSize: fonte.md, fontWeight: "700", color: cores.texto },
  apoio: { fontSize: fonte.base, color: cores.textoSuave, lineHeight: escalarTexto(20) },
  forte: { fontWeight: "700", color: cores.texto },
  motivo: {
    fontSize: fonte.base,
    color: cores.texto,
    fontStyle: "italic",
    paddingLeft: espaco[3],
    borderLeftWidth: 3,
    borderLeftColor: cores.primaria,
    lineHeight: escalarTexto(20),
  },
  erro: { fontSize: fonte.sm, color: cores.perigo, fontWeight: "600" },
  datas: { gap: espaco[1] },
  caixa: { gap: espaco[3], padding: espaco[3], borderWidth: 1, borderColor: cores.borda, borderRadius: raio.md, backgroundColor: cores.superficie },
  subtitulo: { fontSize: fonte.base, fontWeight: "700", color: cores.texto },
  alerta: {
    fontSize: fonte.base,
    color: cores.texto,
    padding: espaco[3],
    borderLeftWidth: 3,
    borderLeftColor: cores.aviso,
    borderRadius: raio.sm,
    backgroundColor: cores.superficie,
    lineHeight: escalarTexto(20),
  },
  linhaBotoes: { flexDirection: "row", gap: espaco[3] },
}));
