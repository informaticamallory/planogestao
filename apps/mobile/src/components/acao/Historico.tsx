import type { AcaoDetalhe } from "@planogestao/shared-types";
import { ActivityIndicator, Text, View } from "react-native";

import { useHistoricoAcao } from "../../hooks/useAcao";
import { cores, escalarTexto, espaco, estilosDinamicos, fonte } from "../../theme";
import { formatarData, formatarDataHora } from "../../utils/formatos";
import { descreverEventoAcao } from "../../utils/historico";
import { ROTULO_SOLICITACAO } from "../../utils/rotulos";
import { AvisoErro } from "../AvisoErro";
import { estilos as e } from "./FluxoPrazo";

const COR_EVENTO: Record<string, string> = {
  criacao: cores.textoSutil,
  alteracao: cores.primaria,
  comentario: cores.info,
  solicitacao: cores.violeta,
  resposta_solicitacao: cores.sucesso,
};

/** Timeline (GET /acoes/{id}/historico), mais recente primeiro. Ex.: "23/09 14:05 — João alterou o progresso de 30% para 70%". */
export function TimelineAcao({ acaoId }: { acaoId: number }) {
  const { data, isLoading, error, refetch } = useHistoricoAcao(acaoId);

  return (
    <View style={e.bloco}>
      <Text style={e.titulo} accessibilityRole="header">
        Histórico
      </Text>
      {isLoading && <ActivityIndicator color={cores.primaria} />}
      {error && !data && <AvisoErro erro={error} onTentar={() => void refetch()} titulo="Não foi possível carregar o histórico" />}
      {data && data.length === 0 && <Text style={e.apoio}>Nenhum evento registrado.</Text>}
      {data?.map((h, i) => (
        <View key={h.id} style={estilos.evento} accessible accessibilityLabel={`${formatarDataHora(h.criado_em)}, ${h.usuario.nome} ${descreverEventoAcao(h)}`}>
          <View style={estilos.eixo}>
            <View style={[estilos.ponto, { backgroundColor: COR_EVENTO[h.evento] ?? cores.textoSutil }]} />
            {i < data.length - 1 && <View style={estilos.linha} />}
          </View>
          <View style={estilos.texto}>
            <Text style={estilos.data}>{formatarDataHora(h.criado_em)}</Text>
            <Text style={estilos.frase}>
              <Text style={estilos.autor}>{h.usuario.nome}</Text> {descreverEventoAcao(h)}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export function ListaSolicitacoes({ acao }: { acao: AcaoDetalhe }) {
  if (acao.solicitacoes.length === 0) return null;
  return (
    <View style={e.bloco}>
      <Text style={e.titulo} accessibilityRole="header">
        Solicitações de prazo
      </Text>
      {acao.solicitacoes.map((s, i) => (
        <View key={s.id} style={[estilos.solicitacao, i > 0 && estilos.divisor]}>
          <Text style={estilos.frase}>
            <Text style={estilos.autor}>{ROTULO_SOLICITACAO[s.status]}</Text> · {formatarData(s.prazo_anterior)} → {formatarData(s.novo_prazo_sugerido)}
          </Text>
          <Text style={e.apoio}>
            {s.solicitado_por.nome}, {formatarDataHora(s.criado_em)} — “{s.motivo}”
          </Text>
          {s.respondido_por && (
            <Text style={e.apoio}>
              Resposta de {s.respondido_por.nome}
              {s.resposta_justificativa && `: “${s.resposta_justificativa}”`}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

const estilos = estilosDinamicos(() => ({
  evento: { flexDirection: "row", gap: espaco[3] },
  eixo: { alignItems: "center", width: 12 },
  ponto: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  linha: { flex: 1, width: 2, backgroundColor: cores.borda, marginTop: 2 },
  texto: { flex: 1, gap: 2, paddingBottom: espaco[3] },
  data: { fontSize: fonte.xs, color: cores.textoSutil, fontVariant: ["tabular-nums"] },
  frase: { fontSize: fonte.base, color: cores.texto, lineHeight: escalarTexto(20) },
  autor: { fontWeight: "700" },
  solicitacao: { gap: 2 },
  divisor: { borderTopWidth: 1, borderTopColor: cores.borda, paddingTop: espaco[3] },
}));
