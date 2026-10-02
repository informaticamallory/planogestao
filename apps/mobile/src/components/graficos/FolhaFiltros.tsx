import type { FiltrosIndicadores } from "@planogestao/api-client";
import type { OpcoesPlanos, TipoPeriodo } from "@planogestao/shared-types";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { cores, espaco, estilosDinamicos, fonte } from "../../theme";
import { ROTULO_PERIODO } from "../../utils/rotulos";
import { Botao } from "../Botao";
import { CampoData } from "../Campos";
import { ChipsUnico, Escolha } from "../Escolhas";
import { FolhaInferior } from "../FolhaInferior";

const PERIODOS = (Object.keys(ROTULO_PERIODO) as TipoPeriodo[]).map((p) => ({ valor: p, rotulo: ROTULO_PERIODO[p] }));

/** Ajuste dos filtros num rascunho: nada é consultado até "Aplicar". */
export function FolhaFiltros({
  visivel,
  filtros,
  opcoes,
  onAplicar,
  onFechar,
}: {
  visivel: boolean;
  filtros: FiltrosIndicadores;
  opcoes: OpcoesPlanos | undefined;
  onAplicar: (f: FiltrosIndicadores) => void;
  onFechar: () => void;
}) {
  const [r, setR] = useState<FiltrosIndicadores>(filtros);
  useEffect(() => {
    if (visivel) setR(filtros);
  }, [visivel, filtros]);

  const mudar = (p: Partial<FiltrosIndicadores>) => setR((a) => ({ ...a, ...p }));
  const personalizado = r.periodo === "personalizado";
  const datasValidas = !!r.data_inicio && !!r.data_fim && r.data_inicio <= r.data_fim;
  const setores = (opcoes?.setores ?? []).filter((s) => !r.area_id || s.area_id === r.area_id);

  const aplicar = () => {
    const f: FiltrosIndicadores = { ...r };
    if (!personalizado) {
      delete f.data_inicio;
      delete f.data_fim;
    }
    onAplicar(f);
  };

  return (
    <FolhaInferior visivel={visivel} titulo="Filtros" onFechar={onFechar}>
      <ChipsUnico rotulo="Período (planos criados)" valor={r.periodo} opcoes={PERIODOS} onEscolher={(p) => mudar({ periodo: p ?? "ano" })} />
      {personalizado && (
        <View style={estilos.linhaDatas}>
          <View style={{ flex: 1 }}>
            <CampoData rotulo="De" valor={r.data_inicio ?? null} onAlterar={(v) => mudar({ data_inicio: v })} />
          </View>
          <View style={{ flex: 1 }}>
            <CampoData
              rotulo="Até"
              valor={r.data_fim ?? null}
              onAlterar={(v) => mudar({ data_fim: v })}
              minimo={r.data_inicio}
              erro={r.data_inicio && r.data_fim && r.data_fim < r.data_inicio ? "Antes do início." : null}
            />
          </View>
        </View>
      )}

      <Escolha
        rotulo="Área"
        todos="Todas"
        valor={r.area_id}
        opcoes={opcoes?.areas ?? []}
        onEscolher={(area) => {
          // Setor de outra área deixaria o conjunto vazio sem motivo aparente (mesma regra do web).
          const setorValido = opcoes?.setores.some((s) => s.id === r.setor_id && s.area_id === area);
          mudar({ area_id: area, setor_id: area && !setorValido ? undefined : r.setor_id });
        }}
      />
      <Escolha rotulo="Setor" todos="Todos" valor={r.setor_id} opcoes={setores} onEscolher={(v) => mudar({ setor_id: v })} />
      <Escolha rotulo="Responsável pelo plano" todos="Todos" valor={r.responsavel_id} opcoes={opcoes?.responsaveis ?? []} onEscolher={(v) => mudar({ responsavel_id: v })} />

      <View style={estilos.botoes}>
        <Botao
          texto="Limpar"
          onPress={() => setR({ periodo: "ano" })}
          flex
          desabilitado={r.periodo === "ano" && !r.area_id && !r.setor_id && !r.responsavel_id}
        />
        <Botao texto="Aplicar" variante="primaria" onPress={aplicar} flex desabilitado={personalizado && !datasValidas} />
      </View>
      {personalizado && !datasValidas && <Text style={estilos.ajuda}>Escolha as duas datas do período personalizado.</Text>}
    </FolhaInferior>
  );
}

const estilos = estilosDinamicos(() => ({
  linhaDatas: { flexDirection: "row", gap: espaco[3] },
  botoes: { flexDirection: "row", gap: espaco[3] },
  ajuda: { fontSize: fonte.sm, color: cores.textoSuave, textAlign: "center" },
}));
