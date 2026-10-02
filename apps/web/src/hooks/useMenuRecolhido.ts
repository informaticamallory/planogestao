import { useCallback, useEffect, useState } from "react";

/**
 * Menu lateral recolhido/expandido: preferência de interface deste navegador, por usuário
 * (localStorage — não é dado sensível). Lida de forma síncrona na montagem do layout, que só
 * existe com o usuário já autenticado: ao recarregar (F5), o menu já nasce no último estado.
 */
const chave = (usuarioId: number | undefined) => `planogestao:menu:${usuarioId ?? "anonimo"}`;

function ler(usuarioId: number | undefined): boolean {
  try {
    return localStorage.getItem(chave(usuarioId)) === "recolhido";
  } catch {
    return false;
  }
}

export function useMenuRecolhido(usuarioId: number | undefined) {
  const [recolhido, setRecolhido] = useState(() => ler(usuarioId));

  // Troca de usuário na mesma aba (logout/login sem recarregar): lê a preferência do novo usuário.
  useEffect(() => setRecolhido(ler(usuarioId)), [usuarioId]);

  const alternar = useCallback(() => {
    setRecolhido((atual) => {
      const novo = !atual;
      try {
        localStorage.setItem(chave(usuarioId), novo ? "recolhido" : "expandido");
      } catch {
        // Sem armazenamento (modo privado etc.): a escolha vale só nesta aba.
      }
      return novo;
    });
  }, [usuarioId]);

  return { recolhido, alternar };
}
