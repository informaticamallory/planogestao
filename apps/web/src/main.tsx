import { ApiError } from "@planogestao/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createBrowserRouter } from "react-router-dom";

import { App } from "./App";
// Aplica tema/densidade salvos (efeito colateral do módulo) antes de renderizar.
import "./store/aparenciaStore";
import "./styles/global.css";

// Acesso negado, não encontrado ou regra de negócio não mudam ao repetir: a tela mostra o motivo na hora.
const SEM_REPETIR = new Set([403, 404, 422]);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (tentativas, erro) => !(erro instanceof ApiError && SEM_REPETIR.has(erro.status)) && tentativas < 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Data router com uma rota "splat": as rotas continuam declaradas em <AppRoutes> (<Routes>),
// e recursos que exigem data router (ex.: useBlocker no wizard) passam a funcionar.
const router = createBrowserRouter([{ path: "*", element: <App /> }]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
