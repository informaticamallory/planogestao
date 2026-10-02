/**
 * Renderizadores genéricos do painel. Recebem o dado já normalizado (tipos.ts) e o tamanho útil do
 * widget em px, e se adaptam: menos rótulos, sem legenda ou sem eixo quando falta espaço — nunca
 * cortando o conteúdo (tabelas e listas longas rolam dentro do widget).
 * Cores sempre por token; identidade nunca só pela cor (legenda/tabela com nome e valor).
 */
import type { Visualizacao } from "@planogestao/shared-types";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useEscalaFonte } from "../../store/aparenciaStore";
import { lerToken, useTemaAtual } from "../../utils/tokens";
import { Table } from "../ui/Table";
import type { Categoria, ConteudoWidget, SerieDef } from "./tipos";
import styles from "./Visualizacoes.module.css";

export interface Tamanho {
  largura: number;
  altura: number;
}

const TOKEN_TOM = { primaria: "--primary", sucesso: "--success", aviso: "--warning", erro: "--danger", info: "--info", neutro: "--fg-subtle" };

function useCores(tokens: string[]) {
  const tema = useTemaAtual();
  return useMemo(
    () => ({
      superficie: lerToken("--cor-superficie"),
      eixo: lerToken("--cor-grafico-eixo"),
      grade: lerToken("--cor-grafico-grade"),
      primaria: lerToken("--cor-primaria"),
      porToken: Object.fromEntries(tokens.map((t) => [t, lerToken(t)])) as Record<string, string>,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- relê as cores ao trocar o tema/cor de destaque
    [tema, tokens.join()],
  );
}

const fmt = (n: number) => n.toLocaleString("pt-BR");
/** Encurta rótulos de eixo quando o espaço por categoria é pequeno (o nome completo fica no tooltip). */
const encurtar = (max: number) => (v: string) => (v.length > max ? `${v.slice(0, Math.max(3, max - 1))}…` : v);

export function RenderizarVisualizacao({ conteudo, tipo, tamanho, editando }: { conteudo: ConteudoWidget; tipo: Visualizacao; tamanho: Tamanho; editando: boolean }) {
  switch (conteudo.forma) {
    case "numero":
      return tipo === "gauge" && conteudo.percentual != null ? <Medidor c={conteudo} /> : <Numero c={conteudo} editando={editando} />;
    case "categorias":
      return <VizCategorias c={conteudo} tipo={tipo} t={tamanho} />;
    case "serie":
      return <VizSerie c={conteudo} tipo={tipo} t={tamanho} />;
    case "empilhado":
      return <VizEmpilhado c={conteudo} tipo={tipo} t={tamanho} />;
    case "personalizado":
      return <div className={styles.rolavel}>{conteudo.conteudo}</div>;
  }
}

// ---- número / medidor ---------------------------------------------------------------------------

type Num = Extract<ConteudoWidget, { forma: "numero" }>;

function Numero({ c, editando }: { c: Num; editando: boolean }) {
  // Fonte proporcional ao widget (container query no CSS): um card menor reduz a fonte, sem cortar.
  const corpo = (
    <>
      <span className={styles.valorNumero}>{c.valor}</span>
      {c.detalhe && <span className={styles.detalheNumero}>{c.detalhe}</span>}
    </>
  );
  if (c.destino && !editando) {
    return (
      <Link to={c.destino} className={`${styles.numero} ${styles.numeroLink}`}>
        {corpo}
      </Link>
    );
  }
  return <div className={styles.numero}>{corpo}</div>;
}

function Medidor({ c }: { c: Num }) {
  const p = Math.max(0, Math.min(100, c.percentual ?? 0));
  const cor = `var(${c.corToken ?? TOKEN_TOM[c.tom ?? "primaria"]})`;
  // Semicírculo de raio 80 (comprimento π·80); o traço preenchido é a fração do valor.
  const comprimento = Math.PI * 80;
  return (
    <div className={styles.medidor} role="img" aria-label={`${c.valor}${c.detalhe ? ` — ${c.detalhe}` : ""}`}>
      <svg viewBox="0 0 200 116" className={styles.svgMedidor} aria-hidden="true">
        <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="var(--border)" strokeWidth="18" strokeLinecap="round" />
        <path
          d="M20 100 A80 80 0 0 1 180 100"
          fill="none"
          stroke={cor}
          strokeWidth="18"
          strokeLinecap="round"
          strokeDasharray={`${(p / 100) * comprimento} ${comprimento}`}
        />
        <text x="100" y="92" textAnchor="middle" className={styles.textoMedidor}>
          {c.valor}
        </text>
        <text x="20" y="114" textAnchor="middle" className={styles.limiteMedidor}>
          0
        </text>
        <text x="180" y="114" textAnchor="middle" className={styles.limiteMedidor}>
          100
        </text>
      </svg>
      {c.detalhe && <span className={styles.detalheNumero}>{c.detalhe}</span>}
    </div>
  );
}

// ---- categorias (partes de um todo) -------------------------------------------------------------

type Cat = Extract<ConteudoWidget, { forma: "categorias" }>;

function TabelaCategorias({ c }: { c: Cat }) {
  const total = c.itens.reduce((s, i) => s + i.total, 0);
  return (
    <div className={styles.rolavel}>
      <Table>
        <thead>
          <tr>
            <th scope="col">Categoria</th>
            <th scope="col" data-numerico>
              {c.rotuloValor}
            </th>
            <th scope="col" data-numerico>
              %
            </th>
          </tr>
        </thead>
        <tbody>
          {c.itens.map((i) => (
            <tr key={i.id}>
              <td>
                <span className={styles.amostra} style={{ background: `var(${i.token})` }} aria-hidden="true" /> {i.nome}
              </td>
              <td data-numerico>{fmt(i.total)}</td>
              <td data-numerico>{total ? Math.round((100 * i.total) / total) : 0}%</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            <td data-numerico>{fmt(total)}</td>
            <td />
          </tr>
        </tfoot>
      </Table>
    </div>
  );
}

function VizCategorias({ c, tipo, t }: { c: Cat; tipo: Visualizacao; t: Tamanho }) {
  // Fatores em px do tamanho padrão × escala da fonte do usuário (o SVG do Recharts não usa rem).
  const e = useEscalaFonte();
  const cores = useCores(c.itens.map((i) => i.token));
  if (tipo === "tabela") return <TabelaCategorias c={c} />;
  if (tipo === "grafico_pizza" || tipo === "grafico_rosca") return <Setores c={c} rosca={tipo === "grafico_rosca"} t={t} cores={cores.porToken} superficie={cores.superficie} />;

  // Barras: horizontais quando os nomes são longos ou o widget é estreito (rótulos legíveis).
  const horizontal = c.itens.some((i) => i.nome.length > 12) || t.largura / Math.max(1, c.itens.length) < 64;
  const tick = { fill: cores.eixo, fontSize: (t.largura < 320 ? 10 : 12) * e };
  if (horizontal) {
    const larguraEixo = Math.min(170 * e, Math.max(70 * e, t.largura * 0.38));
    const maxCar = Math.floor(larguraEixo / (6.5 * e));
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={c.itens} layout="vertical" margin={{ top: 4, right: 36, bottom: 4, left: 4 }}>
          <XAxis type="number" allowDecimals={false} hide />
          <YAxis type="category" dataKey="nome" width={larguraEixo} tickLine={false} axisLine={false} tick={tick} tickFormatter={encurtar(maxCar)} interval={0} />
          <Tooltip cursor={{ fillOpacity: 0.06 }} formatter={(v: number) => [fmt(v), c.rotuloValor]} />
          <Bar dataKey="total" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
            {c.itens.map((i) => (
              <Cell key={i.id} fill={cores.porToken[i.token]} />
            ))}
            <LabelList dataKey="total" position="right" style={{ fontSize: 12 * e, fill: "currentColor" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={c.itens} margin={{ top: 20, right: 8, bottom: 0, left: t.largura < 320 ? -28 : -16 }}>
        <CartesianGrid vertical={false} stroke={cores.grade} />
        <XAxis dataKey="nome" tickLine={false} axisLine={{ stroke: cores.eixo }} tick={tick} interval={0} tickFormatter={encurtar(Math.floor(t.largura / Math.max(1, c.itens.length) / (6.5 * e)))} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={tick} hide={t.largura < 260} />
        <Tooltip cursor={{ fillOpacity: 0.06 }} formatter={(v: number) => [fmt(v), c.rotuloValor]} />
        <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={false}>
          {c.itens.map((i) => (
            <Cell key={i.id} fill={cores.porToken[i.token]} />
          ))}
          <LabelList dataKey="total" position="top" style={{ fontSize: 12 * e, fill: "currentColor" }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function Setores({ c, rosca, t, cores, superficie }: { c: Cat; rosca: boolean; t: Tamanho; cores: Record<string, string>; superficie: string }) {
  const total = c.itens.reduce((s, i) => s + i.total, 0);
  const pct = (n: number) => (total ? Math.round((100 * n) / total) : 0);
  const comDados = c.itens.filter((i) => i.total > 0);
  // Legenda ao lado (largo), embaixo (alto) ou só no tooltip (pequeno demais para as duas coisas).
  const legenda: "lado" | "baixo" | "nenhuma" = t.largura >= 400 ? "lado" : t.altura >= 150 + c.itens.length * 26 ? "baixo" : "nenhuma";
  return (
    <div className={styles.setores} data-legenda={legenda}>
      <div className={styles.areaSetores}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={comDados}
              dataKey="total"
              nameKey="nome"
              innerRadius={rosca ? "62%" : 0}
              outerRadius="92%"
              startAngle={90}
              endAngle={-270}
              stroke={superficie}
              strokeWidth={2}
              isAnimationActive={false}
            >
              {comDados.map((i) => (
                <Cell key={i.id} fill={cores[i.token]} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number, nome: string) => [`${fmt(v)} (${pct(v)}%)`, nome]} />
          </PieChart>
        </ResponsiveContainer>
        {rosca && (
          <div className={styles.centroRosca} aria-hidden="true">
            <span className={styles.totalRosca}>{fmt(total)}</span>
            <span className={styles.rotuloRosca}>{c.rotuloTotal}</span>
          </div>
        )}
      </div>
      {legenda !== "nenhuma" && <LegendaCategorias itens={c.itens} pct={pct} />}
    </div>
  );
}

function LegendaCategorias({ itens, pct }: { itens: Categoria[]; pct: (n: number) => number }) {
  return (
    <ul className={styles.legenda}>
      {itens.map((i) => (
        <li key={i.id} className={styles.itemLegenda}>
          <span className={styles.amostra} style={{ background: `var(${i.token})` }} aria-hidden="true" />
          <span className={styles.nomeLegenda}>{i.nome}</span>
          <span className={styles.valorLegenda}>
            {fmt(i.total)} <span className={styles.pctLegenda}>({pct(i.total)}%)</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

// ---- série temporal -----------------------------------------------------------------------------

type Serie = Extract<ConteudoWidget, { forma: "serie" }>;

function TabelaSeries({ linhas, series, rotulo, chaveNome }: { linhas: Record<string, number | string | null>[]; series: SerieDef[]; rotulo: string; chaveNome: string }) {
  return (
    <div className={styles.rolavel}>
      <Table>
        <thead>
          <tr>
            <th scope="col">{rotulo}</th>
            {series.map((s) => (
              <th key={s.chave} scope="col" data-numerico>
                {s.nome}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i}>
              <td>{l[chaveNome]}</td>
              {series.map((s) => (
                <td key={s.chave} data-numerico>
                  {fmt(Number(l[s.chave] ?? 0))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

function VizSerie({ c, tipo, t }: { c: Serie; tipo: Visualizacao; t: Tamanho }) {
  // Fatores em px do tamanho padrão × escala da fonte do usuário (o SVG do Recharts não usa rem).
  const e = useEscalaFonte();
  const cores = useCores(c.series.map((s) => s.token));
  if (tipo === "tabela") return <TabelaSeries linhas={c.pontos} series={c.series} rotulo={c.rotuloIntervalo} chaveNome="descricao" />;
  const compacto = t.altura < 200;
  const tick = { fill: cores.eixo, fontSize: (t.largura < 360 ? 10 : 12) * e };
  const eixos = (
    <>
      <CartesianGrid vertical={false} stroke={cores.grade} />
      <XAxis dataKey="rotulo" tickLine={false} axisLine={{ stroke: cores.eixo }} tick={tick} minTickGap={t.largura < 360 ? 24 : 12} />
      <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={tick} hide={t.largura < 280} width={36 * e} />
      <Tooltip labelFormatter={(_, itens) => String(itens?.[0]?.payload?.descricao ?? "")} />
      {!compacto && <Legend iconType="circle" wrapperStyle={{ fontSize: 12 * e }} />}
    </>
  );
  const margem = { top: 8, right: 12, bottom: 0, left: t.largura < 280 ? 0 : -12 };
  return (
    <ResponsiveContainer width="100%" height="100%">
      {tipo === "grafico_barra" ? (
        <BarChart data={c.pontos} margin={margem}>
          {eixos}
          {c.series.map((s) => (
            <Bar key={s.chave} dataKey={s.chave} name={s.nome} fill={cores.porToken[s.token]} radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive={false} />
          ))}
        </BarChart>
      ) : (
        <LineChart data={c.pontos} margin={margem}>
          {eixos}
          {c.series.map((s) => (
            <Line
              key={s.chave}
              type="monotone"
              dataKey={s.chave}
              name={s.nome}
              stroke={cores.porToken[s.token]}
              strokeWidth={2}
              dot={c.pontos.length <= 31 && !compacto ? { r: 3, strokeWidth: 2 } : false}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      )}
    </ResponsiveContainer>
  );
}

// ---- grupos × séries (barras empilhadas) --------------------------------------------------------

type Emp = Extract<ConteudoWidget, { forma: "empilhado" }>;

function VizEmpilhado({ c, tipo, t }: { c: Emp; tipo: Visualizacao; t: Tamanho }) {
  // Fatores em px do tamanho padrão × escala da fonte do usuário (o SVG do Recharts não usa rem).
  const e = useEscalaFonte();
  const cores = useCores(c.series.map((s) => s.token));
  if (tipo === "tabela") return <TabelaSeries linhas={c.grupos} series={c.series} rotulo={c.rotuloGrupo} chaveNome="nome" />;
  const comLegenda = t.altura >= 180;
  const larguraEixo = Math.min(170 * e, Math.max(70 * e, t.largura * 0.32));
  // Cada grupo precisa de ~26px para o rótulo ficar legível; se não couber, o gráfico rola por dentro.
  const alturaNecessaria = (c.grupos.length * 26 + (comLegenda ? 64 : 36)) * e;
  return (
    <div className={styles.rolavel}>
      <div style={{ height: Math.max(t.altura, alturaNecessaria) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={c.grupos} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
            <CartesianGrid horizontal={false} stroke={cores.grade} />
            <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={{ stroke: cores.eixo }} tick={{ fill: cores.eixo, fontSize: 11 * e }} />
            <YAxis
              type="category"
              dataKey="nome"
              width={larguraEixo}
              tickLine={false}
              axisLine={false}
              interval={0}
              tick={{ fill: cores.eixo, fontSize: (t.largura < 360 ? 10 : 12) * e }}
              tickFormatter={encurtar(Math.floor(larguraEixo / (6.5 * e)))}
            />
            <Tooltip cursor={{ fillOpacity: 0.06 }} />
            {comLegenda && <Legend iconType="circle" wrapperStyle={{ fontSize: 12 * e }} />}
            {c.series.map((s) => (
              <Bar key={s.chave} dataKey={s.chave} name={s.nome} stackId="total" fill={cores.porToken[s.token]} stroke={cores.superficie} strokeWidth={1} barSize={16} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
