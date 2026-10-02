/**
 * Execução rápida: status por botões grandes (1 toque; concluir/cancelar pedem confirmação),
 * progresso por atalhos + stepper (2 toques: valor e salvar), observação e prazo (gestor).
 * Cada bloco salva só o próprio campo — o histórico registra exatamente o que mudou.
 * Cancelar pede justificativa (obrigatória em subações); concluir avisa se há subações em aberto.
 * Reabrir (gestor, ação concluída) pede justificativa e volta a ação para em andamento.
 */
import type { AcaoAtualizar, AcaoDetalhe, StatusAcao } from "@planogestao/shared-types";
import { useEffect, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import { useAtualizarAcao, useReabrirAcao } from "../../hooks/useAcao";
import { cores, espaco, estilosDinamicos, fonte, raio } from "../../theme";
import { formatarData } from "../../utils/formatos";
import { Botao } from "../Botao";
import { CampoData, CampoTexto } from "../Campos";
import { FolhaInferior } from "../FolhaInferior";
import type { NomeIcone } from "../Icone";
import { ErroAcao, FolhaSolicitacao, estilos as e } from "./FluxoPrazo";

const COM_PROGRESSO: StatusAcao[] = ["em_andamento", "bloqueada"];
const ATALHOS = [0, 25, 50, 75, 100];
const PASSO = 10;
const MIN_JUSTIFICATIVA_REABRIR = 5;

type BotaoTransicao = { texto: string; icone: NomeIcone; variante: "primaria" | "secundaria" | "perigo" | "sucesso" };

function botaoTransicao(de: StatusAcao, para: StatusAcao, ehSubacao: boolean): BotaoTransicao {
  if (para === "em_andamento") return { texto: de === "bloqueada" ? "Retomar" : "Iniciar", icone: "clock", variante: "primaria" };
  if (para === "concluida") return { texto: "Concluir", icone: "checkCircle", variante: "sucesso" };
  if (para === "bloqueada") return { texto: "Bloquear", icone: "alert", variante: "secundaria" };
  if (para === "cancelada") return { texto: ehSubacao ? "Cancelar sub-item" : "Cancelar ação", icone: "alert", variante: "perigo" };
  return { texto: para, icone: "chevronRight", variante: "secundaria" };
}

export function BlocoExecucao({ acao }: { acao: AcaoDetalhe }) {
  const p = acao.permissoes;
  const atualizar = useAtualizarAcao(acao.id);
  const [progresso, setProgresso] = useState(acao.progresso);
  const [observacao, setObservacao] = useState(acao.observacao ?? "");
  const [prazo, setPrazo] = useState(acao.prazo);
  const [bloqueando, setBloqueando] = useState(false);
  const [motivoBloqueio, setMotivoBloqueio] = useState("");
  const [solicitando, setSolicitando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [justificativa, setJustificativa] = useState("");
  const [tentouCancelar, setTentouCancelar] = useState(false);
  const reabrir = useReabrirAcao(acao.id);
  const [reabrindo, setReabrindo] = useState(false);
  const [motivoReabertura, setMotivoReabertura] = useState("");
  const [tentouReabrir, setTentouReabrir] = useState(false);
  const [feito, setFeito] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);

  // Depois de salvar (ou de o detalhe mudar por fora), os rascunhos partem dos dados atuais.
  useEffect(() => {
    setProgresso(acao.progresso);
    setObservacao(acao.observacao ?? "");
    setPrazo(acao.prazo);
  }, [acao]);

  const salvar = (dados: AcaoAtualizar, mensagem: string, aoConcluir?: () => void) => {
    setFeito(null);
    atualizar.mutate(dados, {
      onSuccess: (r) => {
        setFeito(mensagem);
        setAvisos(r.avisos);
        aoConcluir?.();
      },
    });
  };

  // Subação: o backend exige a justificativa do cancelamento; na ação principal ela é opcional.
  const ehSubacao = acao.acao_origem !== null;
  const nomeTipo = ehSubacao ? "sub-item" : "ação";
  // Concordância: "o sub-item … reaberto" / "a ação … reaberta".
  const oTipo = ehSubacao ? "o sub-item" : "a ação";
  const flexao = ehSubacao ? "o" : "a";
  const erroJustificativa =
    tentouCancelar && ehSubacao && !justificativa.trim() ? "Informe a justificativa do cancelamento do sub-item." : null;

  const fecharCancelamento = () => {
    setCancelando(false);
    setJustificativa("");
    setTentouCancelar(false);
  };

  const confirmarCancelamento = () => {
    setTentouCancelar(true);
    const texto = justificativa.trim();
    if (ehSubacao && !texto) return;
    salvar({ status: "cancelada", ...(texto ? { justificativa: texto } : {}) }, ehSubacao ? "Sub-item cancelado." : "Ação cancelada.", fecharCancelamento);
  };

  // Validação só para orientar; a regra definitiva é do servidor.
  const erroReabertura =
    tentouReabrir && motivoReabertura.trim().length < MIN_JUSTIFICATIVA_REABRIR
      ? `Explique por que ${oTipo} está sendo reabert${flexao} (mínimo ${MIN_JUSTIFICATIVA_REABRIR} caracteres).`
      : null;

  const fecharReabertura = () => {
    setReabrindo(false);
    setMotivoReabertura("");
    setTentouReabrir(false);
    reabrir.reset();
  };

  const confirmarReabertura = () => {
    setTentouReabrir(true);
    const texto = motivoReabertura.trim();
    if (texto.length < MIN_JUSTIFICATIVA_REABRIR) return;
    setFeito(null);
    reabrir.mutate(texto, {
      onSuccess: () => {
        fecharReabertura();
        setFeito(ehSubacao ? "Sub-item reaberto." : "Ação reaberta.");
        setAvisos([]);
      },
    });
  };

  const mudarStatus = (para: StatusAcao) => {
    if (para === "bloqueada") return setBloqueando(true);
    if (para === "concluida") {
      // Subações em aberto impedem a conclusão (o backend recusa); avisa antes de tentar.
      if (acao.subacoes_pendentes > 0)
        return Alert.alert(
          "Sub-itens em aberto",
          `Esta ação tem ${acao.subacoes_pendentes === 1 ? "1 sub-item em aberto" : `${acao.subacoes_pendentes} sub-itens em aberto`}. Ela só pode ser concluída depois que ${acao.subacoes_pendentes === 1 ? "o sub-item for encerrado" : "os sub-itens forem encerrados"}.`,
          [{ text: "Entendi", style: "cancel" }],
        );
      return Alert.alert(`Concluir ${nomeTipo}`, `O progresso vai para 100% e ${oTipo} não poderá mais ser alterad${flexao}.`, [
        { text: "Voltar", style: "cancel" },
        { text: "Concluir", onPress: () => salvar({ status: "concluida" }, ehSubacao ? "Sub-item concluído." : "Ação concluída.") },
      ]);
    }
    if (para === "cancelada") return setCancelando(true);
    salvar({ status: para }, para === "em_andamento" ? "Ação em andamento." : "Status atualizado.");
  };

  const progressoEditavel = p.editar_execucao && COM_PROGRESSO.includes(acao.status);
  const progressoMudou = progressoEditavel && progresso !== acao.progresso;
  const observacaoMudou = observacao.trim() !== (acao.observacao ?? "");
  const prazoMudou = p.editar_prazo && prazo !== acao.prazo;
  const ajustar = (n: number) => setProgresso(Math.max(0, Math.min(100, n)));

  return (
    <View style={e.bloco}>
      <Text style={e.titulo} accessibilityRole="header">
        Execução
      </Text>

      {p.transicoes.length > 0 && (
        <View style={estilos.grade}>
          {p.transicoes.map((s) => {
            const b = botaoTransicao(acao.status, s, ehSubacao);
            return (
              <View key={s} style={estilos.celula}>
                <Botao
                  texto={b.texto}
                  icone={b.icone}
                  variante={b.variante}
                  onPress={() => mudarStatus(s)}
                  carregando={atualizar.isPending && atualizar.variables?.status === s}
                  desabilitado={atualizar.isPending}
                />
              </View>
            );
          })}
        </View>
      )}
      {p.reabrir && acao.status === "concluida" && (
        <Botao
          texto={ehSubacao ? "Reabrir sub-item" : "Reabrir ação"}
          icone="refresh"
          onPress={() => setReabrindo(true)}
          desabilitado={atualizar.isPending || reabrir.isPending}
        />
      )}
      {acao.status === "bloqueada" && acao.motivo_bloqueio && <Text style={e.apoio}>Bloqueada: {acao.motivo_bloqueio}</Text>}
      {p.transicoes.includes("concluida") && acao.subacoes_pendentes > 0 && (
        <Text style={estilos.aviso}>Só é possível concluir depois que os sub-itens em aberto forem encerrados.</Text>
      )}

      {/* Progresso */}
      <View style={estilos.secao}>
        <View style={estilos.linhaTitulo}>
          <Text style={estilos.rotulo}>Progresso</Text>
          <Text style={estilos.valorGrande} accessibilityLiveRegion="polite">
            {progresso}%
          </Text>
        </View>
        {progressoEditavel ? (
          <>
            <View style={estilos.stepper}>
              <Passo texto={`−${PASSO}`} rotulo={`Diminuir ${PASSO}%`} onPress={() => ajustar(progresso - PASSO)} desabilitado={progresso <= 0} />
              <View style={estilos.trilho} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <View style={[estilos.preenchimento, { width: `${progresso}%` }]} />
              </View>
              <Passo texto={`+${PASSO}`} rotulo={`Aumentar ${PASSO}%`} onPress={() => ajustar(progresso + PASSO)} desabilitado={progresso >= 100} />
            </View>
            <View style={estilos.atalhos} accessibilityRole="radiogroup" accessibilityLabel="Atalhos de progresso">
              {ATALHOS.map((v) => (
                <Pressable
                  key={v}
                  onPress={() => setProgresso(v)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: progresso === v }}
                  style={({ pressed }) => [estilos.atalho, progresso === v && estilos.atalhoAtivo, pressed && { opacity: 0.75 }]}
                >
                  <Text style={[estilos.textoAtalho, progresso === v && { color: cores.primariaTexto }]}>{v}%</Text>
                </Pressable>
              ))}
            </View>
            {progresso === 100 && acao.status === "em_andamento" && (
              <Text style={e.apoio}>100% não conclui a ação: use “Concluir” quando ela estiver entregue.</Text>
            )}
            {progressoMudou && (
              <View style={e.linhaBotoes}>
                <Botao texto="Desfazer" onPress={() => setProgresso(acao.progresso)} flex compacto desabilitado={atualizar.isPending} />
                <Botao
                  texto={`Salvar ${progresso}%`}
                  variante="primaria"
                  onPress={() => salvar({ progresso }, `Progresso salvo: ${progresso}%.`)}
                  carregando={atualizar.isPending && atualizar.variables?.progresso !== undefined}
                  desabilitado={atualizar.isPending}
                  flex
                  compacto
                />
              </View>
            )}
          </>
        ) : (
          <Text style={e.apoio}>
            {acao.status === "aceita"
              ? acao.aguardando.length > 0
                ? "A ação só pode ser iniciada depois que as ações anteriores forem concluídas."
                : "Inicie a ação para registrar o progresso."
              : "Editável com a ação em andamento ou bloqueada."}
          </Text>
        )}
      </View>

      {/* Prazo */}
      <View style={estilos.secao}>
        {p.editar_prazo ? (
          <>
            <CampoData
              rotulo="Prazo de conclusão"
              valor={prazo}
              onAlterar={setPrazo}
              ajuda={prazo > acao.plano.data_fim_estimado ? `Após o fim estimado do plano (${formatarData(acao.plano.data_fim_estimado)}).` : null}
            />
            {prazoMudou && (
              <View style={e.linhaBotoes}>
                <Botao texto="Desfazer" onPress={() => setPrazo(acao.prazo)} flex compacto desabilitado={atualizar.isPending} />
                <Botao
                  texto="Salvar prazo"
                  variante="primaria"
                  onPress={() => salvar({ prazo }, "Prazo alterado.")}
                  carregando={atualizar.isPending && atualizar.variables?.prazo !== undefined}
                  desabilitado={atualizar.isPending}
                  flex
                  compacto
                />
              </View>
            )}
          </>
        ) : (
          <View style={estilos.linhaTitulo}>
            <View>
              <Text style={estilos.rotulo}>Prazo de conclusão</Text>
              <Text style={estilos.valorPrazo}>{formatarData(acao.prazo)}</Text>
            </View>
            {p.solicitar_alteracao && acao.status !== "aguardando_aceite" && (
              <Botao texto="Pedir outro prazo" icone="calendar" onPress={() => setSolicitando(true)} compacto />
            )}
          </View>
        )}
      </View>

      {/* Observação */}
      <View style={estilos.secao}>
        <CampoTexto
          rotulo="Observação"
          multiline
          maxLength={2000}
          value={observacao}
          onChangeText={setObservacao}
          editable={p.editar_execucao}
          placeholder={p.editar_execucao ? "Anote o andamento, dificuldades…" : undefined}
        />
        {observacaoMudou && p.editar_execucao && (
          <View style={e.linhaBotoes}>
            <Botao texto="Desfazer" onPress={() => setObservacao(acao.observacao ?? "")} flex compacto desabilitado={atualizar.isPending} />
            <Botao
              texto="Salvar observação"
              variante="primaria"
              onPress={() => salvar({ observacao: observacao.trim() }, "Observação salva.")}
              carregando={atualizar.isPending && atualizar.variables?.observacao !== undefined}
              desabilitado={atualizar.isPending}
              flex
              compacto
            />
          </View>
        )}
      </View>

      {atualizar.isError && <ErroAcao erro={atualizar.error} />}
      {feito && !atualizar.isError && (
        <Text style={estilos.feito} accessibilityLiveRegion="polite">
          ✓ {feito}
        </Text>
      )}
      {avisos.map((a) => (
        <Text key={a} style={estilos.aviso}>
          {a}
        </Text>
      ))}

      <FolhaInferior
        visivel={bloqueando}
        titulo="Bloquear ação"
        onFechar={() => {
          setBloqueando(false);
          setMotivoBloqueio("");
        }}
      >
        <CampoTexto
          rotulo="Motivo do bloqueio"
          obrigatorio
          maxLength={500}
          value={motivoBloqueio}
          onChangeText={setMotivoBloqueio}
          placeholder="Ex.: aguardando peça do fornecedor"
          autoFocus
        />
        {atualizar.isError && <ErroAcao erro={atualizar.error} />}
        <Botao
          texto="Bloquear"
          variante="primaria"
          icone="alert"
          desabilitado={!motivoBloqueio.trim()}
          carregando={atualizar.isPending}
          onPress={() =>
            salvar({ status: "bloqueada", motivo_bloqueio: motivoBloqueio.trim() }, "Ação bloqueada.", () => {
              setBloqueando(false);
              setMotivoBloqueio("");
            })
          }
        />
      </FolhaInferior>
      <FolhaInferior visivel={cancelando} titulo={ehSubacao ? "Cancelar sub-item" : "Cancelar ação"} onFechar={fecharCancelamento}>
        <Text style={e.apoio}>
          {ehSubacao ? "Ele" : "Ela"} deixa de contar nos indicadores e não poderá mais ser alterad{flexao}.
        </Text>
        <CampoTexto
          rotulo={ehSubacao ? "Justificativa do cancelamento" : "Justificativa do cancelamento (opcional)"}
          obrigatorio={ehSubacao}
          multiline
          maxLength={1000}
          value={justificativa}
          onChangeText={setJustificativa}
          placeholder={`Por que ${oTipo} está sendo cancelad${flexao}?`}
          erro={erroJustificativa}
          autoFocus
        />
        {atualizar.isError && <ErroAcao erro={atualizar.error} />}
        <View style={e.linhaBotoes}>
          <Botao texto="Voltar" onPress={fecharCancelamento} flex desabilitado={atualizar.isPending} />
          <Botao
            texto={ehSubacao ? "Cancelar sub-item" : "Cancelar ação"}
            variante="perigo"
            icone="alert"
            onPress={confirmarCancelamento}
            carregando={atualizar.isPending}
            flex
          />
        </View>
      </FolhaInferior>
      {p.reabrir && (
        <FolhaInferior visivel={reabrindo} titulo={ehSubacao ? "Reabrir sub-item" : "Reabrir ação"} onFechar={fecharReabertura}>
          <Text style={e.apoio}>{ehSubacao ? "O sub-item" : "A ação"} volta para em andamento e o status do plano é recalculado.</Text>
          <CampoTexto
            rotulo="Justificativa"
            obrigatorio
            multiline
            maxLength={1000}
            value={motivoReabertura}
            onChangeText={setMotivoReabertura}
            placeholder={`Por que ${oTipo} precisa ser reabert${flexao}?`}
            erro={erroReabertura}
            autoFocus
          />
          {reabrir.isError && <ErroAcao erro={reabrir.error} />}
          <View style={e.linhaBotoes}>
            <Botao texto="Voltar" onPress={fecharReabertura} flex desabilitado={reabrir.isPending} />
            <Botao texto="Reabrir" variante="primaria" icone="refresh" onPress={confirmarReabertura} carregando={reabrir.isPending} flex />
          </View>
        </FolhaInferior>
      )}
      {p.solicitar_alteracao && <FolhaSolicitacao acao={acao} visivel={solicitando} onFechar={() => setSolicitando(false)} />}
    </View>
  );
}

function Passo({ texto, rotulo, onPress, desabilitado }: { texto: string; rotulo: string; onPress: () => void; desabilitado: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={desabilitado}
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      hitSlop={6}
      style={({ pressed }) => [estilos.passo, pressed && { backgroundColor: cores.primariaSuave }, desabilitado && { opacity: 0.4 }]}
    >
      <Text style={estilos.textoPasso}>{texto}</Text>
    </Pressable>
  );
}

const estilos = estilosDinamicos(() => ({
  grade: { flexDirection: "row", flexWrap: "wrap", gap: espaco[3] },
  celula: { flexGrow: 1, flexBasis: "45%" },
  secao: { gap: espaco[3], paddingTop: espaco[3], borderTopWidth: 1, borderTopColor: cores.borda },
  linhaTitulo: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: espaco[3] },
  rotulo: { fontSize: fonte.sm, fontWeight: "700", color: cores.texto },
  valorGrande: { fontSize: fonte.titulo, fontWeight: "800", color: cores.texto, fontVariant: ["tabular-nums"] },
  valorPrazo: { fontSize: fonte.md, color: cores.texto, marginTop: 2 },
  stepper: { flexDirection: "row", alignItems: "center", gap: espaco[3] },
  passo: {
    width: 64,
    height: 56,
    borderRadius: raio.md,
    borderWidth: 1.5,
    borderColor: cores.primaria,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: cores.superficie,
  },
  textoPasso: { fontSize: fonte.lg, fontWeight: "800", color: cores.primaria },
  trilho: { flex: 1, height: 12, borderRadius: 6, backgroundColor: cores.fundo2, overflow: "hidden" },
  preenchimento: { height: "100%", borderRadius: 6, backgroundColor: cores.primaria },
  atalhos: { flexDirection: "row", gap: espaco[2] },
  atalho: {
    flex: 1,
    minHeight: 48,
    borderRadius: raio.md,
    borderWidth: 1.5,
    borderColor: cores.borda,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: cores.superficie,
  },
  atalhoAtivo: { backgroundColor: cores.primaria, borderColor: cores.primaria },
  textoAtalho: { fontSize: fonte.base, fontWeight: "700", color: cores.texto, fontVariant: ["tabular-nums"] },
  feito: { fontSize: fonte.sm, fontWeight: "700", color: cores.sucesso },
  aviso: { fontSize: fonte.sm, color: cores.aviso, backgroundColor: cores.avisoSuave, padding: espaco[3], borderRadius: raio.sm },
}));
