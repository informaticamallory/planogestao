import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { AppLayout } from "../components/layout/AppLayout";
import { AcaoDetalhePage } from "../pages/acoes/AcaoDetalhePage";
import { MinhasAcoesPage } from "../pages/acoes/MinhasAcoesPage";
import { MeuPerfilPage } from "../pages/perfil/MeuPerfilPage";
import { AcessoNegadoPage } from "../pages/AcessoNegadoPage";
import { AreasPage, OrigensPage, SetoresPage, TiposPlanoPage } from "../pages/admin/CadastrosPages";
import { ConfiguracoesPage } from "../pages/admin/ConfiguracoesPage";
import { EmailConfigPage } from "../pages/admin/EmailConfigPage";
import { PerfisPage } from "../pages/admin/PerfisPage";
import { UsuariosPage } from "../pages/admin/UsuariosPage";
import { CalendarioPage } from "../pages/calendario/CalendarioPage";
import { IndicadoresPage } from "../pages/indicadores/IndicadoresPage";
import { ItensPage } from "../pages/itens/ItensPage";
import { NotificacoesPage } from "../pages/notificacoes/NotificacoesPage";
import { RelatoriosPage } from "../pages/relatorios/RelatoriosPage";
import { DashboardPage } from "../pages/dashboard/DashboardPage";
import { EmConstrucaoPage } from "../pages/EmConstrucaoPage";
import { EquipeDetalhePage } from "../pages/equipes/EquipeDetalhePage";
import { EquipeFormPage } from "../pages/equipes/EquipeFormPage";
import { EquipesPage } from "../pages/equipes/EquipesPage";
import { AuditoriaPontuacaoPage } from "../pages/gamificacao/AuditoriaPontuacaoPage";
import { GamificacaoPage } from "../pages/gamificacao/GamificacaoPage";
import { PeriodosApuracaoPage } from "../pages/gamificacao/PeriodosApuracaoPage";
import { LoginPage } from "../pages/LoginPage";
import { NaoEncontradaPage } from "../pages/NaoEncontradaPage";
import { EditarPlanoPage } from "../pages/planos/EditarPlanoPage";
import { NovoPlanoPage } from "../pages/planos/NovoPlanoPage";
import { PlanoDetalhePage } from "../pages/planos/PlanoDetalhePage";
import { PlanosPage } from "../pages/planos/PlanosPage";
import { TODOS_ITENS } from "./menu";
import { PrivateRoute } from "./PrivateRoute";

// Vitrine do UI Kit: só em desenvolvimento (o import dinâmico some do build de produção).
const VitrineUiKitPage = import.meta.env.DEV
  ? lazy(() => import("../pages/dev/VitrineUiKitPage").then((m) => ({ default: m.VitrineUiKitPage })))
  : null;

/**
 * Antigo "Painel de Ações" (removido: o resumo foi para o Dashboard e o detalhamento para Indicadores).
 * Links salvos caem no Dashboard, levando o período quando ele vale para a data de criação.
 */
function RedirecionarPainelAcoes() {
  const antigos = new URLSearchParams(useLocation().search);
  const novos = new URLSearchParams();
  if (antigos.get("campo_data") !== "prazo") {
    for (const chave of ["periodo", "data_inicio", "data_fim"]) {
      const valor = antigos.get(chave);
      if (valor) novos.set(chave, valor);
    }
  }
  const query = novos.toString();
  return <Navigate to={query ? `/dashboard?${query}` : "/dashboard"} replace />;
}

/** Telas já implementadas, por caminho do menu. */
const PAGINAS: Record<string, ReactNode> = {
  "/dashboard": <DashboardPage />,
  "/planos": <PlanosPage />,
  "/planos/novo": <NovoPlanoPage />,
  "/planos/:id": <PlanoDetalhePage />,
  "/planos/:id/editar": <EditarPlanoPage />,
  "/acoes": <ItensPage />,
  "/acoes/:id": <AcaoDetalhePage />,
  "/minhas-acoes": <MinhasAcoesPage />,
  "/calendario": <CalendarioPage />,
  "/indicadores": <IndicadoresPage />,
  "/relatorios": <RelatoriosPage />,
  "/notificacoes": <NotificacoesPage />,
  "/gamificacao": <GamificacaoPage />,
  "/gamificacao/periodos": <PeriodosApuracaoPage />,
  "/gamificacao/auditoria": <AuditoriaPontuacaoPage />,
  "/equipes": <EquipesPage />,
  "/equipes/nova": <EquipeFormPage />,
  "/equipes/:id": <EquipeDetalhePage />,
  "/equipes/:id/editar": <EquipeFormPage />,
  // Administração: usuários, perfis e configurações exigem admin:* (só o Administrador); áreas, setores, tipos e
  // origens exigem cadastros:gerenciar (Administrador e Gestor). A API responde 403 aos demais.
  "/admin/usuarios": <UsuariosPage />,
  "/admin/perfis": <PerfisPage />,
  "/admin/areas": <AreasPage />,
  "/admin/setores": <SetoresPage />,
  "/admin/tipos-plano": <TiposPlanoPage />,
  "/admin/origens": <OrigensPage />,
  "/admin/configuracoes": <ConfiguracoesPage />,
  "/admin/email": <EmailConfigPage />,
};

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {VitrineUiKitPage && (
        <Route
          path="/dev/ui-kit"
          element={
            <Suspense fallback={null}>
              <VitrineUiKitPage />
            </Suspense>
          }
        />
      )}

      <Route
        element={
          <PrivateRoute>
            <AppLayout />
          </PrivateRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        {/* Rota estática: vem antes de /acoes/:id na escolha do React Router. */}
        <Route path="/acoes/painel" element={<RedirecionarPainelAcoes />} />
        {/* Itens sem tela implementada ainda mostram uma página provisória. */}
        {TODOS_ITENS.map((item) => (
          <Route
            key={item.caminho}
            path={item.caminho}
            element={
              <PrivateRoute permissao={item.permissao}>
                {PAGINAS[item.caminho] ?? <EmConstrucaoPage titulo={item.titulo} />}
              </PrivateRoute>
            }
          />
        ))}
        {/* Sem permissão específica: todo usuário logado gerencia a própria conta. */}
        <Route path="/meu-perfil" element={<MeuPerfilPage />} />
        <Route path="/acesso-negado" element={<AcessoNegadoPage />} />
        <Route path="*" element={<NaoEncontradaPage />} />
      </Route>
    </Routes>
  );
}
