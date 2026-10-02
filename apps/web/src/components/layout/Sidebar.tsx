import { useEffect, useRef, useState, type FocusEvent, type MouseEvent } from "react";
import { NavLink } from "react-router-dom";

import { MENU_ADMINISTRACAO, MENU_PRINCIPAL, type ItemMenu } from "../../routes/menu";
import { temPermissao, useAuthStore } from "../../store/authStore";
import { Icon } from "../ui/Icon";
import styles from "./Sidebar.module.css";
import { UserCard } from "./UserCard";

/** Tooltip do menu recolhido: posição fixa na tela (não é cortado pela rolagem da navegação). */
interface Dica {
  texto: string;
  top: number;
  left: number;
}

export type AbrirDica = (texto: string, e: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) => void;

function ItemDoMenu({ item, recolhido, abrirDica, fecharDica }: { item: ItemMenu; recolhido: boolean; abrirDica: AbrirDica; fecharDica: () => void }) {
  const dica = recolhido
    ? { onMouseEnter: (e: MouseEvent<HTMLElement>) => abrirDica(item.titulo, e), onFocus: (e: FocusEvent<HTMLElement>) => abrirDica(item.titulo, e), onMouseLeave: fecharDica, onBlur: fecharDica }
    : {};
  return (
    <li>
      <NavLink
        to={item.caminho}
        end
        className={({ isActive }) => (isActive ? `${styles.itemMenu} ${styles.itemMenuAtivo}` : styles.itemMenu)}
        {...dica}
      >
        {item.icone && <Icon name={item.icone} size={17} />}
        {/* Recolhido, o texto some da tela mas continua sendo o nome acessível do link. */}
        <span className={styles.rotuloItem}>{item.titulo}</span>
      </NavLink>
    </li>
  );
}

interface SidebarProps {
  recolhido: boolean;
  onAlternar: () => void;
  /** Celular: menu fora da tela, aberto pelo ☰ do topo. */
  gaveta?: boolean;
  aberta?: boolean;
  onFechar?: () => void;
}

export function Sidebar({ recolhido, onAlternar, gaveta = false, aberta = false, onFechar }: SidebarProps) {
  const usuario = useAuthStore((s) => s.usuario);
  const visiveis = (itens: ItemMenu[]) => itens.filter((i) => temPermissao(usuario, i.permissao));
  const [dica, setDica] = useState<Dica | null>(null);

  const principais = visiveis(MENU_PRINCIPAL);
  const administracao = visiveis(MENU_ADMINISTRACAO.itens);

  const abrirDica: AbrirDica = (texto, e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setDica({ texto, top: r.top + r.height / 2, left: r.right + 10 });
  };
  const fecharDica = () => setDica(null);
  const alternar = () => {
    fecharDica();
    onAlternar();
  };
  const rotuloBotao = recolhido ? "Expandir menu" : "Recolher menu";
  const navegacao = useRef<HTMLElement>(null);

  // Gaveta aberta: o foco vai para o item ativo (ou o primeiro), para navegar direto pelo teclado.
  useEffect(() => {
    if (!gaveta || !aberta) return;
    const nav = navegacao.current;
    (nav?.querySelector<HTMLElement>('[aria-current="page"]') ?? nav?.querySelector<HTMLElement>("a"))?.focus();
  }, [gaveta, aberta]);

  return (
    <aside
      className={styles.sidebar}
      data-recolhido={recolhido || undefined}
      data-gaveta={gaveta || undefined}
      data-aberta={(gaveta && aberta) || undefined}
      // Fechada, a gaveta fica fora da tela e fora da ordem de foco/leitura.
      {...(gaveta && !aberta ? ({ inert: "", "aria-hidden": true } as object) : {})}
      aria-label={gaveta ? "Menu" : undefined}
      data-nao-imprimir
    >
      <div className={styles.marca}>
        <span className={styles.logomarca} aria-hidden="true">
          P
        </span>
        <span className={styles.textoMarca}>
          <span className={styles.nomeMarca}>PlanoGestão</span>
          <span className={styles.subMarca}>Mallory · Planos de Ação</span>
        </span>
        {gaveta && (
          <button type="button" className={styles.fecharGaveta} onClick={onFechar} aria-label="Fechar menu">
            <Icon name="x" size={20} />
          </button>
        )}
      </div>

      <nav
        ref={navegacao}
        id="menu-lateral"
        className={styles.navegacao}
        aria-label="Menu principal"
        onScroll={fecharDica}
        // Tocar num item (mesmo o da página atual) fecha a gaveta.
        onClick={(e) => gaveta && (e.target as HTMLElement).closest("a") && onFechar?.()}
      >
        <ul className={styles.listaMenu}>
          {principais.map((item) => (
            <ItemDoMenu key={item.caminho} item={item} recolhido={recolhido} abrirDica={abrirDica} fecharDica={fecharDica} />
          ))}
        </ul>

        {administracao.length > 0 && (
          <div className={styles.grupoMenu} role="group" aria-label={MENU_ADMINISTRACAO.titulo}>
            {/* Recolhido: o título some e fica só a linha separando os grupos. */}
            <span className={styles.tituloGrupo} aria-hidden="true">
              {MENU_ADMINISTRACAO.titulo}
            </span>
            <ul className={styles.listaMenu}>
              {administracao.map((item) => (
                <ItemDoMenu key={item.caminho} item={item} recolhido={recolhido} abrirDica={abrirDica} fecharDica={fecharDica} />
              ))}
            </ul>
          </div>
        )}
      </nav>

      {!gaveta && (
        <button
          type="button"
          className={styles.botaoRecolher}
          onClick={alternar}
          aria-expanded={!recolhido}
          aria-controls="menu-lateral"
          aria-label={rotuloBotao}
          onMouseEnter={recolhido ? (e) => abrirDica(rotuloBotao, e) : undefined}
          onFocus={recolhido ? (e) => abrirDica(rotuloBotao, e) : undefined}
          onMouseLeave={fecharDica}
          onBlur={fecharDica}
        >
          <Icon name={recolhido ? "chevronRight" : "chevronLeft"} size={16} />
          <span className={styles.rotuloItem}>Recolher menu</span>
        </button>
      )}

      <UserCard recolhido={recolhido} abrirDica={abrirDica} fecharDica={fecharDica} />

      {recolhido && dica && (
        <span className={styles.dica} role="tooltip" style={{ top: dica.top, left: dica.left }}>
          {dica.texto}
        </span>
      )}
    </aside>
  );
}
