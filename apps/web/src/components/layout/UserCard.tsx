import type { FocusEvent, MouseEvent } from "react";
import { NavLink, useNavigate } from "react-router-dom";

import { useLogout } from "../../hooks/useAuth";
import { useAuthStore } from "../../store/authStore";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import type { AbrirDica } from "./Sidebar";
import styles from "./UserCard.module.css";

export function UserCard({ recolhido = false, abrirDica, fecharDica }: { recolhido?: boolean; abrirDica?: AbrirDica; fecharDica?: () => void }) {
  const usuario = useAuthStore((s) => s.usuario);
  const logout = useLogout();
  const navigate = useNavigate();

  if (!usuario) return null;

  const sair = () => logout.mutate(undefined, { onSettled: () => navigate("/login", { replace: true }) });
  const dica = (texto: string) =>
    recolhido && abrirDica
      ? { onMouseEnter: (e: MouseEvent<HTMLElement>) => abrirDica(texto, e), onMouseLeave: fecharDica }
      : {};

  return (
    <div className={styles.userCard} data-recolhido={recolhido || undefined}>
      {/* Nome/avatar levam a Meu Perfil (a conta do próprio usuário); o Sair fica à parte. */}
      <NavLink
        to="/meu-perfil"
        className={({ isActive }) => (isActive ? `${styles.link} ${styles.linkAtivo}` : styles.link)}
        aria-label={recolhido ? `Meu perfil — ${usuario.nome}` : undefined}
        title={recolhido ? undefined : "Meu perfil"}
        {...dica(`Meu perfil · ${usuario.nome}`)}
        {...(recolhido && abrirDica
          ? { onFocus: (e: FocusEvent<HTMLElement>) => abrirDica(`Meu perfil · ${usuario.nome}`, e), onBlur: fecharDica }
          : {})}
      >
        <span className={styles.avatar}>
          <Avatar nome={usuario.nome} url={usuario.avatar_url} tamanho="sm" />
        </span>
        <span className={styles.dados}>
          <span className={styles.nome}>{usuario.nome}</span>
          <span className={styles.perfil}>{usuario.perfil.nome}</span>
        </span>
      </NavLink>
      <Button
        variante="icone"
        tamanho="sm"
        className={styles.sair}
        onClick={sair}
        disabled={logout.isPending}
        aria-label="Sair"
        title={recolhido ? undefined : "Sair"}
        {...(recolhido && abrirDica
          ? {
              onMouseEnter: (e: MouseEvent<HTMLElement>) => abrirDica("Sair", e),
              onMouseLeave: fecharDica,
              onFocus: (e: FocusEvent<HTMLElement>) => abrirDica("Sair", e),
              onBlur: fecharDica,
            }
          : {})}
      >
        <Icon name="logOut" size={16} />
      </Button>
    </div>
  );
}
