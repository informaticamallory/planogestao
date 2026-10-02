import { useRestaurarSessao } from "./hooks/useAuth";
import { AppRoutes } from "./routes/AppRoutes";

export function App() {
  useRestaurarSessao();
  return <AppRoutes />;
}
