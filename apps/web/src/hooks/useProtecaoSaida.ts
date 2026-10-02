import { useCallback, useEffect, useRef } from "react";
import { useBlocker } from "react-router-dom";

/**
 * Protege um formulário com alterações não salvas:
 * - navegação interna é bloqueada (use `blocker.state === "blocked"` para mostrar um modal);
 * - fechar/recarregar a aba mostra o aviso nativo do navegador.
 * Chame `liberar()` antes de navegar após salvar com sucesso.
 */
export function useProtecaoSaida(alterado: boolean) {
  const liberado = useRef(false);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      alterado && !liberado.current && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!alterado) return;
    const avisar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [alterado]);

  const liberar = useCallback(() => {
    liberado.current = true;
  }, []);

  return { blocker, liberar };
}
