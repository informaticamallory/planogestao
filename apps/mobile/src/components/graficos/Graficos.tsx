/**
 * Gráficos dos Indicadores no celular. Rosca, barras verticais e linhas usam
 * react-native-gifted-charts (SVG); barras horizontais/empilhadas são Views simples — mais legíveis
 * em tela estreita (rótulo inteiro acima da barra) e sem a rotação do modo horizontal da lib.
 * A cor nunca é a única informação: sempre há rótulo e valor em texto.
 */
import { Text, View } from "react-native";
import { BarChart, LineChart, PieChart } from "react-native-gifted-charts";

import { cores, escalarTexto, espaco, estilosDinamicos, fonte, raio } from "../../theme";
import { formatarNumero } from "../../utils/formatos";

export interface Fatia {
  id: string;
  nome: string;
  total: number;
  cor: string;
}

const pctDe = (n: number, total: number) => (total ? Math.round((100 * n) / total) : 0);

export function Legenda({ itens, total }: { itens: Fatia[]; total?: number }) {
  return (
    <View style={estilos.legenda}>
      {itens.map((f) => (
        <View key={f.id} style={estilos.itemLegenda}>
          <View style={[estilos.amostra, { backgroundColor: f.cor }]} />
          <Text style={estilos.nomeLegenda}>{f.nome}</Text>
          <Text style={estilos.valorLegenda}>
            {formatarNumero(f.total)}
            {total !== undefined && <Text style={estilos.pct}> ({pctDe(f.total, total)}%)</Text>}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function Rosca({ fatias, rotuloTotal }: { fatias: Fatia[]; rotuloTotal: string }) {
  const total = fatias.reduce((s, f) => s + f.total, 0);
  const visiveis = fatias.filter((f) => f.total > 0);
  return (
    <View style={{ gap: espaco[4], alignItems: "center" }}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <PieChart
          donut
          data={visiveis.map((f) => ({ value: f.total, color: f.cor }))}
          radius={88}
          innerRadius={58}
          strokeWidth={2}
          strokeColor={cores.superficie}
          innerCircleColor={cores.superficie}
          centerLabelComponent={() => (
            <View style={{ alignItems: "center" }}>
              <Text style={estilos.totalRosca}>{formatarNumero(total)}</Text>
              <Text style={estilos.rotuloRosca}>{rotuloTotal}</Text>
            </View>
          )}
        />
      </View>
      <Legenda itens={fatias} total={total} />
    </View>
  );
}

/** Uma barra por categoria; os nomes vão na legenda (7 rótulos não cabem no eixo de um celular). */
export function BarrasVerticais({ dados, largura }: { dados: Fatia[]; largura: number }) {
  const n = Math.max(dados.length, 1);
  const eixo = 28;
  const util = largura - eixo - 16;
  const barra = Math.max(10, Math.min(32, (util / n) * 0.6));
  const espacamento = Math.max(4, util / n - barra);
  const maximo = Math.max(1, ...dados.map((d) => d.total));
  return (
    <View style={{ gap: espaco[4] }}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <BarChart
          data={dados.map((d) => ({ value: d.total, frontColor: d.cor }))}
          width={util}
          height={180}
          barWidth={barra}
          spacing={espacamento}
          initialSpacing={espacamento / 2}
          maxValue={Math.ceil(maximo * 1.15)}
          noOfSections={4}
          roundedTop
          showValuesAsTopLabel
          topLabelTextStyle={estilos.valorTopo}
          yAxisLabelWidth={eixo}
          yAxisTextStyle={estilos.eixo}
          yAxisThickness={0}
          xAxisColor={cores.borda}
          rulesColor={cores.borda}
          disableScroll
          isAnimated={false}
        />
      </View>
      <Legenda itens={dados} />
    </View>
  );
}

export interface Serie {
  chave: string;
  nome: string;
  cor: string;
}

export function Linhas<T extends Record<string, number | string>>({
  pontos,
  rotulos,
  series,
  largura,
}: {
  pontos: T[];
  rotulos: string[];
  series: Serie[]; // até 3
  largura: number;
}) {
  const eixo = 28;
  const util = largura - eixo - 16;
  const espacamento = pontos.length > 1 ? Math.max(24, (util - 24) / (pontos.length - 1)) : util / 2;
  const linha = (s?: Serie) => (s ? pontos.map((p) => ({ value: Number(p[s.chave]) || 0 })) : undefined);
  const maximo = Math.max(1, ...pontos.flatMap((p) => series.map((s) => Number(p[s.chave]) || 0)));
  const [a, b, c] = series;
  return (
    <View style={{ gap: espaco[3] }}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <LineChart
          data={linha(a)}
          data2={linha(b)}
          data3={linha(c)}
          color1={a?.cor}
          color2={b?.cor}
          color3={c?.cor}
          dataPointsColor1={a?.cor}
          dataPointsColor2={b?.cor}
          dataPointsColor3={c?.cor}
          thickness={2.5}
          dataPointsRadius={3.5}
          width={util}
          height={180}
          spacing={espacamento}
          initialSpacing={12}
          endSpacing={12}
          maxValue={Math.ceil(maximo * 1.15)}
          noOfSections={4}
          xAxisLabelTexts={rotulos}
          xAxisLabelTextStyle={estilos.eixo}
          yAxisTextStyle={estilos.eixo}
          yAxisLabelWidth={eixo}
          yAxisThickness={0}
          xAxisColor={cores.borda}
          rulesColor={cores.borda}
          isAnimated={false}
        />
      </View>
      <View style={estilos.legendaLinha}>
        {series.map((s) => (
          <View key={s.chave} style={estilos.itemLegendaLinha}>
            <View style={[estilos.traco, { backgroundColor: s.cor }]} />
            <Text style={estilos.nomeLegenda}>{s.nome}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Série única: rótulo em cima, barra proporcional e valor ao lado. */
export function BarrasHorizontais({ dados, cor = cores.primaria }: { dados: { rotulo: string; total: number }[]; cor?: string }) {
  const maximo = Math.max(1, ...dados.map((d) => d.total));
  return (
    <View style={{ gap: espaco[3] }}>
      {dados.map((d) => (
        <View key={d.rotulo} style={{ gap: 4 }} accessible accessibilityLabel={`${d.rotulo}: ${d.total}`}>
          <Text style={estilos.rotuloBarra}>{d.rotulo}</Text>
          <View style={estilos.linhaBarra}>
            <View style={estilos.trilho}>
              <View style={[estilos.preenchimento, { width: `${(100 * d.total) / maximo}%`, backgroundColor: cor }]} />
            </View>
            <Text style={estilos.valorBarra}>{formatarNumero(d.total)}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/** Uma linha por grupo, segmentos empilhados na ordem das séries; total à direita. */
export function BarrasEmpilhadas<T extends { nome: string }>({ dados, series }: { dados: T[]; series: Serie[] }) {
  const valor = (d: T, s: Serie) => Number((d as Record<string, unknown>)[s.chave]) || 0;
  const totalDe = (d: T) => series.reduce((soma, s) => soma + valor(d, s), 0);
  const maximo = Math.max(1, ...dados.map(totalDe));
  return (
    <View style={{ gap: espaco[3] }}>
      <View style={estilos.legendaLinha}>
        {series.map((s) => (
          <View key={s.chave} style={estilos.itemLegendaLinha}>
            <View style={[estilos.amostra, { backgroundColor: s.cor }]} />
            <Text style={estilos.nomeLegenda}>{s.nome}</Text>
          </View>
        ))}
      </View>
      {dados.map((d) => {
        const total = totalDe(d);
        return (
          <View
            key={d.nome}
            style={{ gap: 4 }}
            accessible
            accessibilityLabel={`${d.nome}: ${total}. ${series.map((s) => `${s.nome} ${valor(d, s)}`).join(", ")}`}
          >
            <Text style={estilos.rotuloBarra} numberOfLines={1}>
              {d.nome}
            </Text>
            <View style={estilos.linhaBarra}>
              <View style={[estilos.trilho, { flexDirection: "row" }]}>
                <View style={{ width: `${(100 * total) / maximo}%`, flexDirection: "row", height: "100%" }}>
                  {series.map((s) =>
                    valor(d, s) > 0 ? (
                      <View key={s.chave} style={{ flex: valor(d, s), backgroundColor: s.cor, borderRightWidth: 1.5, borderRightColor: cores.superficie }} />
                    ) : null,
                  )}
                </View>
              </View>
              <Text style={estilos.valorBarra}>{formatarNumero(total)}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Alternativa em lista/tabela: primeira coluna = rótulo, demais numéricas. */
export function Tabela({ colunas, linhas }: { colunas: string[]; linhas: (string | number)[][] }) {
  return (
    <View style={estilos.tabela} accessibilityRole="list">
      <View style={[estilos.linhaTabela, estilos.cabecalhoTabela]} accessibilityRole="header">
        {colunas.map((c, i) => (
          <Text key={c} style={[estilos.celula, i === 0 ? estilos.celulaRotulo : estilos.celulaNumero, estilos.textoCabecalho]} numberOfLines={2}>
            {c}
          </Text>
        ))}
      </View>
      {linhas.map((l, i) => (
        <View key={`${l[0]}-${i}`} style={[estilos.linhaTabela, i % 2 === 1 && { backgroundColor: cores.fundo }]}>
          {l.map((v, j) => (
            <Text key={j} style={[estilos.celula, j === 0 ? estilos.celulaRotulo : estilos.celulaNumero]} numberOfLines={2}>
              {typeof v === "number" ? formatarNumero(v) : v}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

const estilos = estilosDinamicos(() => ({
  legenda: { alignSelf: "stretch", gap: espaco[2] },
  itemLegenda: { flexDirection: "row", alignItems: "center", gap: espaco[2] },
  amostra: { width: 12, height: 12, borderRadius: 3 },
  nomeLegenda: { flex: 1, fontSize: fonte.sm, color: cores.texto },
  valorLegenda: { fontSize: fonte.sm, fontWeight: "700", color: cores.texto, fontVariant: ["tabular-nums"] },
  pct: { fontWeight: "400", color: cores.textoSuave },
  totalRosca: { fontSize: fonte.xl, fontWeight: "800", color: cores.texto, fontVariant: ["tabular-nums"] },
  rotuloRosca: { fontSize: fonte.xs, color: cores.textoSuave },
  valorTopo: { fontSize: fonte.xs, fontWeight: "700", color: cores.texto },
  eixo: { fontSize: escalarTexto(10), color: cores.textoSuave },
  legendaLinha: { flexDirection: "row", flexWrap: "wrap", gap: espaco[3] },
  itemLegendaLinha: { flexDirection: "row", alignItems: "center", gap: 6 },
  traco: { width: 16, height: 3, borderRadius: 2 },
  rotuloBarra: { fontSize: fonte.sm, color: cores.texto },
  linhaBarra: { flexDirection: "row", alignItems: "center", gap: espaco[2] },
  trilho: { flex: 1, height: 14, borderRadius: 4, backgroundColor: cores.fundo2, overflow: "hidden" },
  preenchimento: { height: "100%", borderRadius: 4 },
  valorBarra: { minWidth: 32, textAlign: "right", fontSize: fonte.sm, fontWeight: "700", color: cores.texto, fontVariant: ["tabular-nums"] },
  tabela: { borderWidth: 1, borderColor: cores.borda, borderRadius: raio.md, overflow: "hidden" },
  linhaTabela: { flexDirection: "row", alignItems: "center", minHeight: 40, paddingHorizontal: espaco[2] },
  cabecalhoTabela: { backgroundColor: cores.fundo2 },
  celula: { paddingVertical: 6, paddingHorizontal: 4, fontSize: fonte.sm, color: cores.texto },
  celulaRotulo: { flex: 2 },
  celulaNumero: { flex: 1, textAlign: "right", fontVariant: ["tabular-nums"] },
  textoCabecalho: { fontSize: fonte.xs, fontWeight: "700", color: cores.textoSuave },
}));
