import { useCallback, useState } from "react";

import { useAuthStore } from "../store/authStore";

/**
 * Preferência de interface guardada no localStorage, separada por usuário.
 * Apenas para conveniências visuais (nunca dados sensíveis ou de negócio).
 */
export function usePreferencia<T>(nome: string, padrao: T, validar: (valor: unknown) => valor is T) {
  const usuarioId = useAuthStore((s) => s.usuario?.id ?? "anonimo");
  const chave = `planogestao:pref:${usuarioId}:${nome}`;

  const [valor, setValor] = useState<T>(() => {
    try {
      const bruto = localStorage.getItem(chave);
      const lido: unknown = bruto === null ? null : JSON.parse(bruto);
      return validar(lido) ? lido : padrao;
    } catch {
      return padrao;
    }
  });

  const salvar = useCallback(
    (novo: T) => {
      setValor(novo);
      try {
        localStorage.setItem(chave, JSON.stringify(novo));
      } catch {
        // Armazenamento indisponível (modo privado, cota): mantém só em memória.
      }
    },
    [chave],
  );

  return [valor, salvar] as const;
}
