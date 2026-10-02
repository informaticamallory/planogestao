import type { DadoCatalogo, Visualizacao, WidgetLayout } from "@planogestao/shared-types";
import { useEffect, useRef, useState, type RefObject } from "react";
import GridLayout, { useContainerWidth, type Layout } from "react-grid-layout";
import { absoluteStrategy } from "react-grid-layout/core";
import "react-grid-layout/css/styles.css";

import type { Painel } from "../../hooks/usePainel";
import { Button } from "../ui/Button";
import { Drawer } from "../ui/Drawer";
import { DropdownItem, DropdownMenu } from "../ui/DropdownMenu";
import { Icon } from "../ui/Icon";
import { Select } from "../ui/Select";
import { useEscalaFonte } from "../../store/aparenciaStore";
import { useFaixa } from "../../utils/breakpoints";
import { aplicarLayout, colunasDoGrid, COLUNAS_DESKTOP, layoutParaColunas } from "./layoutGrid";
import { ROTULO_VISUALIZACAO, type FonteWidget, type Fontes } from "./tipos";
import { RenderizarVisualizacao, type Tamanho } from "./Visualizacoes";
import styles from "./PainelWidgets.module.css";

// Em px do tamanho de fonte padrão; multiplicados pela escala do usuário (o grid posiciona em px).
const ALTURA_LINHA = 32;
const MARGEM = 16;

/** Tamanho útil do corpo do widget, para a visualização se adaptar. */
function useTamanho() {
  const ref = useRef<HTMLDivElement>(null);
  const [tamanho, setTamanho] = useState<Tamanho>({ largura: 0, altura: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new ResizeObserver(([e]) => {
      const { width, height } = e!.contentRect;
      setTamanho((t) => (Math.abs(t.largura - width) < 1 && Math.abs(t.altura - height) < 1 ? t : { largura: width, altura: height }));
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, tamanho] as const;
}

/** Botão do cabeçalho da página: entra no modo de edição (desabilitado em telas estreitas). */
export function BotaoPersonalizar({ painel, larguraSuficiente }: { painel: Painel; larguraSuficiente: boolean }) {
  if (painel.editando) return null;
  return (
    <Button
      onClick={painel.iniciarEdicao}
      disabled={painel.carregando || !larguraSuficiente}
      title={larguraSuficiente ? "Mover, redimensionar e trocar os widgets deste painel" : "Amplie a janela para editar o layout (a edição usa o grid de 12 colunas)"}
    >
      <Icon name="layout" size={15} />
      Personalizar
    </Button>
  );
}

/**
 * Grid livre de widgets (12 colunas no desktop). Em telas menores, os mesmos widgets são reempilhados
 * automaticamente na ordem de leitura (6 colunas no tablet, 2 no celular) — o usuário só configura o desktop.
 */
export function PainelWidgets({
  painel,
  fontes,
  somenteLeitura = false,
  onColunas,
}: {
  painel: Painel;
  /** Dados disponíveis nesta tela; widgets de dados sem fonte (ex.: não fornecidos na aba da equipe) não aparecem. */
  fontes: Fontes;
  somenteLeitura?: boolean;
  /** Informa quantas colunas o grid está usando (a página habilita "Personalizar" só com 12). */
  onColunas?: (colunas: number) => void;
}) {
  const { width, containerRef, mounted } = useContainerWidth({ measureBeforeMount: true });
  const colunas = colunasDoGrid(useFaixa(), width);
  const escala = useEscalaFonte();
  const editando = painel.editando && !somenteLeitura && colunas === COLUNAS_DESKTOP;
  const [catalogoAberto, setCatalogoAberto] = useState(false);

  useEffect(() => {
    if (mounted) onColunas?.(colunas);
  }, [colunas, mounted, onColunas]);

  const disponiveis = painel.widgets.filter((w) => fontes[w.tipo_dado] && painel.catalogo.has(w.tipo_dado));
  const visiveis = disponiveis.filter((w) => w.visivel);
  const layout = layoutParaColunas(visiveis, colunas, painel.catalogo, editando);

  const aoMudarLayout = (novo: Layout) => {
    if (!editando) return;
    const atualizados = aplicarLayout(painel.widgets, novo);
    if (atualizados.some((w, i) => w !== painel.widgets[i])) painel.definirWidgets(atualizados);
  };

  return (
    <div className={styles.painel} data-editando={editando || undefined}>
      {editando && (
        <div className={styles.barraEdicao} role="toolbar" aria-label="Edição do layout">
          <span className={styles.avisoEdicao}>
            <Icon name="layout" size={15} />
            Editando o layout: arraste os widgets e redimensione pelo canto. Use ⋮ para trocar o tipo, ocultar ou remover.
          </span>
          <div className={styles.acoesEdicao}>
            <Button onClick={() => setCatalogoAberto(true)}>
              <Icon name="plus" size={15} />
              Adicionar widget
            </Button>
            <Button variante="link" onClick={painel.restaurarPadrao} disabled={painel.salvando || (!painel.personalizado && !painel.alterado)}>
              Restaurar padrão
            </Button>
            <Button onClick={painel.sairSemSalvar} disabled={painel.salvando}>
              Sair sem salvar
            </Button>
            <Button variante="primaria" onClick={painel.salvar} disabled={painel.salvando || !painel.alterado}>
              {painel.salvando ? "Salvando…" : "Salvar layout"}
            </Button>
          </div>
          {painel.erroSalvar && <p className={styles.erro}>Não foi possível salvar: {painel.erroSalvar.message}</p>}
        </div>
      )}

      {painel.editando && !editando && !somenteLeitura && (
        <p className={styles.avisoEstreito}>A janela ficou estreita demais para editar. Amplie-a para continuar ou saia sem salvar.</p>
      )}

      {Boolean(painel.erro) && <p className={styles.erro}>Não foi possível carregar o layout do painel.</p>}
      {!painel.carregando && visiveis.length === 0 && (
        <p className={styles.vazio}>
          {editando ? "O painel está vazio. Use “Adicionar widget”." : "Nenhum widget visível neste painel. Use “Personalizar” para adicionar."}
        </p>
      )}

      <div ref={containerRef as RefObject<HTMLDivElement>} className={styles.areaGrid}>
        {mounted && !painel.carregando && (
          <GridLayout
            width={width}
            layout={layout}
            gridConfig={{ cols: colunas, rowHeight: ALTURA_LINHA * escala, margin: [MARGEM * escala, MARGEM * escala], containerPadding: [0, 0] }}
            dragConfig={{ enabled: editando, cancel: ".nao-arrastar", threshold: 4 }}
            resizeConfig={{ enabled: editando, handles: ["se", "e", "s"] }}
            // top/left em vez de transform: o menu ⋮ (position: fixed) fica ancorado corretamente.
            positionStrategy={absoluteStrategy}
            onLayoutChange={aoMudarLayout}
          >
            {visiveis.map((w) => (
              <div key={w.id} className={styles.celula}>
                <QuadroWidget
                  key={`${w.id}:${w.tipo_dado}`}
                  widget={w}
                  fonte={fontes[w.tipo_dado]!}
                  dado={painel.catalogo.get(w.tipo_dado)!}
                  editando={editando}
                  onTrocar={(t) => painel.trocarVisualizacao(w.id, t)}
                  onOcultar={() => painel.ocultar(w.id)}
                  onRemover={() => painel.remover(w.id)}
                />
              </div>
            ))}
          </GridLayout>
        )}
      </div>

      {editando && (
        <CatalogoWidgets
          aberto={catalogoAberto}
          onFechar={() => setCatalogoAberto(false)}
          catalogo={[...painel.catalogo.values()].filter((d) => fontes[d.tipo_dado])}
          ocultos={disponiveis.filter((w) => !w.visivel)}
          noPainel={new Set(visiveis.map((w) => w.tipo_dado))}
          onAdicionar={(d, t) => {
            painel.adicionar(d, t);
            setCatalogoAberto(false);
          }}
          onMostrar={(id) => {
            painel.mostrar(id);
            setCatalogoAberto(false);
          }}
        />
      )}
    </div>
  );
}

function QuadroWidget({
  widget,
  fonte,
  dado,
  editando,
  onTrocar,
  onOcultar,
  onRemover,
}: {
  widget: WidgetLayout;
  fonte: FonteWidget;
  dado: DadoCatalogo;
  editando: boolean;
  onTrocar: (t: Visualizacao) => void;
  onOcultar: () => void;
  onRemover: () => void;
}) {
  const r = fonte.useDado();
  const [ref, tamanho] = useTamanho();
  const numero = r.conteudo?.forma === "numero" || dado.visualizacoes.every((v) => v === "card_numero" || v === "gauge");
  const marcador = r.conteudo?.forma === "numero" ? r.conteudo.corToken : undefined;

  let corpo;
  if (r.isLoading) corpo = <p className={styles.estado}>Carregando…</p>;
  else if (r.error) corpo = <p className={`${styles.estado} ${styles.estadoErro}`}>Não foi possível carregar.</p>;
  else if (r.vazio || !r.conteudo) corpo = <p className={styles.estado}>{r.mensagemVazio ?? "Nenhum dado no período selecionado."}</p>;
  else if (tamanho.largura > 0) corpo = <RenderizarVisualizacao conteudo={r.conteudo} tipo={widget.tipo_visualizacao} tamanho={tamanho} editando={editando} />;

  return (
    <section className={styles.widget} data-numero={numero || undefined} aria-label={dado.titulo} aria-busy={r.isLoading || r.atualizando || undefined}>
      <header className={styles.cabecalho}>
        <h3 className={styles.titulo} title={dado.titulo}>
          {marcador && <span className={styles.marcador} style={{ background: `var(${marcador})` }} aria-hidden="true" />}
          {dado.titulo}
        </h3>
        {r.atualizando && !editando && <span className={styles.atualizando}>Atualizando…</span>}
        {!editando && r.acoes && <div className={styles.acoes}>{r.acoes}</div>}
        {editando && (
          <span className={`nao-arrastar ${styles.menu}`}>
            <DropdownMenu rotulo={<Icon name="more" size={18} />} ariaLabel={`Opções de ${dado.titulo}`} classeBotao={styles.botaoMenu}>
              {(fechar) => (
                <>
                  <span className={styles.grupoMenu}>Alterar tipo de gráfico</span>
                  {dado.visualizacoes.length === 1 ? (
                    <DropdownItem onClick={fechar} disabled>
                      Só como {ROTULO_VISUALIZACAO[dado.visualizacoes[0]!].toLowerCase()}
                    </DropdownItem>
                  ) : (
                    dado.visualizacoes.map((v) => (
                      <DropdownItem
                        key={v}
                        onClick={() => {
                          onTrocar(v);
                          fechar();
                        }}
                      >
                        <span className={styles.itemViz}>
                          {ROTULO_VISUALIZACAO[v]}
                          {v === widget.tipo_visualizacao && <Icon name="check" size={14} />}
                        </span>
                      </DropdownItem>
                    ))
                  )}
                  <span className={styles.separadorMenu} role="separator" />
                  <DropdownItem
                    onClick={() => {
                      onOcultar();
                      fechar();
                    }}
                  >
                    Ocultar este widget
                  </DropdownItem>
                  <DropdownItem
                    onClick={() => {
                      onRemover();
                      fechar();
                    }}
                  >
                    Remover deste painel
                  </DropdownItem>
                </>
              )}
            </DropdownMenu>
          </span>
        )}
      </header>
      {/* container-type no corpo: a fonte dos cards acompanha o tamanho do widget. */}
      <div ref={ref} className={styles.corpo}>
        {corpo}
      </div>
    </section>
  );
}

function CatalogoWidgets({
  aberto,
  onFechar,
  catalogo,
  ocultos,
  noPainel,
  onAdicionar,
  onMostrar,
}: {
  aberto: boolean;
  onFechar: () => void;
  catalogo: DadoCatalogo[];
  ocultos: WidgetLayout[];
  noPainel: Set<string>;
  onAdicionar: (d: DadoCatalogo, t: Visualizacao) => void;
  onMostrar: (id: string) => void;
}) {
  const [escolhas, setEscolhas] = useState<Record<string, Visualizacao>>({});
  const titulo = new Map(catalogo.map((d) => [d.tipo_dado, d.titulo]));

  return (
    <Drawer aberto={aberto} titulo="Adicionar widget" onFechar={onFechar} largura={440}>
      {ocultos.length > 0 && (
        <section className={styles.secaoCatalogo} aria-labelledby="cat-ocultos">
          <h3 id="cat-ocultos" className={styles.tituloSecao}>
            Ocultos
          </h3>
          <ul className={styles.listaCatalogo}>
            {ocultos.map((w) => (
              <li key={w.id} className={styles.itemCatalogo}>
                <span className={styles.nomeCatalogo}>
                  {titulo.get(w.tipo_dado)}
                  <span className={styles.metaCatalogo}>{ROTULO_VISUALIZACAO[w.tipo_visualizacao]}</span>
                </span>
                <Button tamanho="sm" onClick={() => onMostrar(w.id)}>
                  <Icon name="eye" size={14} />
                  Mostrar
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.secaoCatalogo} aria-labelledby="cat-todos">
        <h3 id="cat-todos" className={styles.tituloSecao}>
          Indicadores e gráficos
        </h3>
        <p className={styles.ajudaCatalogo}>Escolha o dado e como exibi-lo. O widget entra na primeira posição livre do grid.</p>
        <ul className={styles.listaCatalogo}>
          {catalogo.map((d) => {
            const tipo = escolhas[d.tipo_dado] ?? d.visualizacoes[0]!;
            return (
              <li key={d.tipo_dado} className={styles.itemCatalogo}>
                <span className={styles.nomeCatalogo}>
                  {d.titulo}
                  {noPainel.has(d.tipo_dado) && <span className={styles.metaCatalogo}>Já está no painel</span>}
                </span>
                <span className={styles.controlesCatalogo}>
                  {d.visualizacoes.length > 1 && (
                    <Select
                      compacto
                      aria-label={`Visualização de ${d.titulo}`}
                      value={tipo}
                      onChange={(e) => setEscolhas((x) => ({ ...x, [d.tipo_dado]: e.target.value as Visualizacao }))}
                    >
                      {d.visualizacoes.map((v) => (
                        <option key={v} value={v}>
                          {ROTULO_VISUALIZACAO[v]}
                        </option>
                      ))}
                    </Select>
                  )}
                  <Button tamanho="sm" variante="primaria" onClick={() => onAdicionar(d, tipo)} aria-label={`Adicionar ${d.titulo}`}>
                    <Icon name="plus" size={14} />
                    Adicionar
                  </Button>
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </Drawer>
  );
}
