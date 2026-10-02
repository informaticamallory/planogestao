import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { CarregandoTela } from "../components/feedback/CarregandoTela";
import { temPermissao, useAuthStore } from "../store/authStore";

interface PrivateRouteProps {
  children: ReactNode;
  /** Exige que o perfil do usuário tenha esta permissão. */
  permissao?: string;
  /** Restringe a perfis específicos, pelo nome (ex. ["Administrador", "Gestor"]). */
  perfis?: string[];
}

export function PrivateRoute({ children, permissao, perfis }: PrivateRouteProps) {
  const { status, usuario } = useAuthStore();
  const location = useLocation();

  if (status === "verificando") return <CarregandoTela />;

  if (status === "anonimo" || !usuario) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  const perfilOk = !perfis || perfis.includes(usuario.perfil.nome);
  const permissaoOk = !permissao || temPermissao(usuario, permissao);
  if (!perfilOk || !permissaoOk) return <Navigate to="/acesso-negado" replace />;

  return <>{children}</>;
}
