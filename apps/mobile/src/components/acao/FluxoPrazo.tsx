/** Aceite e contraproposta de prazo (mesmas regras do web, Fase 6; quem decide é o backend). */
import type { AcaoDetalhe } from "@planogestao/shared-types";
import { useState } from "react";
import { Text, View } from "react-native";

import { mensagemDeErro } from "../../hooks/useAuth";
import { useAceitarAcao, useResponderSolicitacao, useSolicitarAlteracao } from "../../hooks/useAcao";
import { cores, escalarTexto, espaco, estilosDinamicos, fonte, raio } from "../../theme";
import { formatarData, formatarDataHora, paraIsoData } from "../../utils/formatos";
import { Botao } from "../Botao";
import { CampoData, CampoTexto } from "../Campos";
import { FolhaInferior } from "../FolhaInferior";

export function ErroAcao({ erro }: { erro: unknown }) {
  return (
    <Text style={estilos.erro} accessibilityRole="alert">
      {mensagemDeErro(erro)}
    </Text>
  );
}

/** Bottom sheet: novo prazo (seletor nativo) + motivo. */
export function FolhaSolicitacao({ acao, visivel, onFechar }: { acao: AcaoDetalhe; visivel: boolean; onFechar: () => void }) {
  const [prazo, setPrazo] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [tentou, setTentou] = useState(false);
  const solicitar = useSolicitarAlteracao(acao.id);
  const hoje = paraIsoData(new Date());

  // Validação só para orientar; a regra definitiva (passado no fuso do negócio etc.) é do servidor.
  const erros: { prazo?: string; motivo?: string } = {};
  if (!prazo) erros.prazo = "Escolha o novo prazo sugerido.";
  else if (prazo < hoje) erros.prazo = "O prazo sugerido não pode estar no passado.";
  else if (prazo === acao.prazo) erros.prazo = "O prazo sugerido é igual ao atual.";
  if (motivo.trim().length < 5) erros.motivo = "Explique o motivo (mínimo 5 caracteres).";
  const visiveis = tentou ? erros : {};

  const fechar = () => {
    setPrazo(null);
    setMotivo("");
    setTentou(false);
    solicitar.reset();
    onFechar();
  };

  const enviar = () => {
    setTentou(true);
    if (erros.prazo || erros.motivo || !prazo) return;
    solicitar.mutate({ novo_prazo_sugerido: prazo, motivo: motivo.trim() }, { onSuccess: fechar });
  };

  return (
    <FolhaInferior visivel={visivel} titulo="Solicitar alteração de prazo" onFechar={fechar}>
      <Text style={estilos.apoio}>
        Prazo de conclusão atual: <Text style={estilos.forte}>{formatarData(acao.prazo)}</Text>. O gestor do plano será notificado e poderá aprovar ou recusar.
        {acao.status === "aguardando_aceite" && " Se aprovada, a ação é aceita automaticamente."}
      </Text>
      <CampoData rotulo="Novo prazo sugerido" obrigatorio valor={prazo} onAlterar={setPrazo} minimo={hoje} erro={visiveis.prazo} />
      <CampoTexto
        rotulo="Motivo"
        obrigatorio
        multiline
        maxLength={1000}
        value={motivo}
        onChangeText={setMotivo}
        placeholder="Por que o prazo precisa mudar?"
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
        <Text style={estilos.apoio} accessibilityRole="text">
          Você sugeriu mudar o prazo para <Text style={estilos.forte}>{formatarData(pendente.novo_prazo_sugerido)}</Text> em{" "}
          {formatarDataHora(pendente.criado_em)}. Aguardando resposta do gestor — se aprovada, a ação é aceita automaticamente.
        </Text>
      ) : (
        <>
          <Text style={estilos.apoio}>
            Prazo de conclusão: <Text style={estilos.forte}>{formatarData(acao.prazo)}</Text>. Aceite a ação ou proponha outro prazo.
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

/** Gestor/criador do plano, com solicitação pendente feita por outra pessoa. */
export function BlocoRespostaSolicitacao({ acao }: { acao: AcaoDetalhe }) {
  const s = acao.solicitacao_pendente!;
  const [aberto, setAberto] = useState(false);
  const [justificativa, setJustificativa] = useState("");
  const responder = useResponderSolicitacao(acao.id);
  const aposFimDoPlano = s.novo_prazo_sugerido > acao.plano.data_fim_estimado;

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
        <Text style={estilos.forte}>{s.solicitado_por.nome}</Text> pediu em {formatarDataHora(s.criado_em)} para mudar o prazo de{" "}
        <Text style={estilos.forte}>{formatarData(s.prazo_anterior)}</Text> para{" "}
        <Text style={estilos.forte}>{formatarData(s.novo_prazo_sugerido)}</Text>
        {aposFimDoPlano && ` (após o fim estimado do plano, ${formatarData(acao.plano.data_fim_estimado)})`}.
      </Text>
      <Text style={estilos.motivo}>“{s.motivo}”</Text>
      {s.feita_antes_do_aceite && <Text style={estilos.apoio}>Pedido feito antes do aceite: ao aprovar, a ação é aceita automaticamente.</Text>}
    </>
  );

  return (
    <View style={[estilos.bloco, estilos.destaque]}>
      <Text style={estilos.titulo} accessibilityRole="header">
        Solicitação de alteração de prazo
      </Text>
      {resumo}
      <Botao texto="Responder solicitação" variante="primaria" icone="userCheck" onPress={() => setAberto(true)} />

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
  linhaBotoes: { flexDirection: "row", gap: espaco[3] },
}));
