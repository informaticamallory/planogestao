import { useEffect, useRef, useState, type HTMLAttributes } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";

import { useMenuRecolhido } from "../../hooks/useMenuRecolhido";
import { useAuthStore } from "../../store/authStore";
import { useFaixa } from "../../utils/breakpoints";
import { useLembrarListaPlanos } from "../../utils/hierarquiaPlanos";
import { SinoNotificacoes } from "../notificacoes/SinoNotificacoes";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import styles from "./AppLayout.module.css";
import { SELETOR_DENSIDADE_VISIVEL } from "../../store/aparenciaStore";
import { ControlesAparencia } from "./ControlesAparencia";
import { Sidebar } from "./Sidebar";

// React 18 ainda não tipa o atributo `inert` (fundo não focável/clicável com a gaveta aberta).
const inerte = (ativo: boolean) => (ativo ? ({ inert: "" } as HTMLAttributes<HTMLElement>) : {});

/**
 * Menu lateral por faixa de largura (styles/breakpoints.css):
 * - desktop: expandido/recolhido pela preferência salva do usuário;
 * - tablet: começa recolhido (só ícones) sempre que a tela entra nessa faixa; expansível na sessão;
 * - mobile: sai da tela e vira gaveta (off-canvas) aberta pelo ☰, com camada escura por trás.
 * Com o menu recolhido/fechado, o conteúdo ocupa toda a largura restante.
 */
export function AppLayout() {
  const usuario = useAuthStore((s) => s.usuario);
  const usuarioId = usuario?.id;
  const faixa = useFaixa();
  const desktop = useMenuRecolhido(usuarioId);
  const [expandidoTablet, setExpandidoTablet] = useState(false);
  const [gavetaAberta, setGavetaAberta] = useState(false);
  const location = useLocation();
  const botaoMenu = useRef<HTMLButtonElement>(null);
  // Filtros/página da listagem de planos (para "Todos os planos" no caminho do plano e da ação).
  useLembrarListaPlanos();

  // Ao mudar de faixa: tablet volta a começar recolhido e a gaveta do celular fecha.
  useEffect(() => {
    setExpandidoTablet(false);
    setGavetaAberta(false);
  }, [faixa]);

  // Navegou (tocou num item do menu): fecha a gaveta.
  useEffect(() => setGavetaAberta(false), [location.pathname]);

  const gaveta = faixa === "mobile";
  const recolhido = faixa === "desktop" ? desktop.recolhido : faixa === "tablet" ? !expandidoTablet : false;
  const alternar = faixa === "desktop" ? desktop.alternar : () => setExpandidoTablet((v) => !v);

  const fecharGaveta = () => {
    setGavetaAberta(false);
    botaoMenu.current?.focus();
  };

  // Esc fecha a gaveta; a página por trás não rola enquanto ela está aberta.
  useEffect(() => {
    if (!gavetaAberta) return;
    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && fecharGaveta();
    document.addEventListener("keydown", aoTeclar);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflow;
    };
  }, [gavetaAberta]);

  // A estrutura é a mesma em todos os estados (só mudam atributos): recolher/expandir/abrir não
  // remonta a página em <Outlet />, então a rota e o estado da tela ficam intactos.
  return (
    <div className={styles.appLayout} data-menu={gaveta ? "gaveta" : recolhido ? "recolhido" : "expandido"}>
      <Sidebar
        recolhido={recolhido}
        onAlternar={alternar}
        gaveta={gaveta}
        aberta={gavetaAberta}
        onFechar={fecharGaveta}
      />
      {gaveta && gavetaAberta && <div className={styles.camada} onClick={fecharGaveta} aria-hidden="true" data-nao-imprimir />}
      <div className={styles.area} {...inerte(gaveta && gavetaAberta)}>
        <header className={styles.barraSuperior} data-nao-imprimir>
          {gaveta && (
            <Button
              ref={botaoMenu}
              variante="icone"
              className={styles.botaoMenu}
              onClick={() => setGavetaAberta(true)}
              aria-label="Abrir menu"
              aria-expanded={gavetaAberta}
              aria-controls="menu-lateral"
            >
              <Icon name="menu" size={20} />
            </Button>
          )}
          {gaveta && (
            <span className={styles.marcaMobile} aria-hidden="true">
              <span className={styles.logomarca}>P</span>
              PlanoGestão
            </span>
          )}
          <div className={styles.controlesBarra}>
            <ControlesAparencia comDensidade={SELETOR_DENSIDADE_VISIVEL} />
            <SinoNotificacoes />
            {/* Foto (ou iniciais) do usuário, como na sidebar: atalho para Meu Perfil. */}
            {usuario && (
              <Link to="/meu-perfil" className={styles.avatarTopo} aria-label={`Meu perfil — ${usuario.nome}`} title="Meu perfil">
                <Avatar nome={usuario.nome} url={usuario.avatar_url} tamanho="sm" />
              </Link>
            )}
          </div>
        </header>
        <main className={`${styles.conteudo} fade-up`}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
