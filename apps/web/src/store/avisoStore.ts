/** Aviso curto de confirmação (ex.: "Plano excluído"), mostrado por cima da tela e que some sozinho. */
import { create } from "zustand";

interface Aviso {
  id: number;
  texto: string;
}

interface AvisoState {
  aviso: Aviso | null;
  avisar: (texto: string) => void;
  fechar: () => void;
}

const DURACAO_MS = 4000;
let temporizador: ReturnType<typeof setTimeout> | undefined;

export const useAvisoStore = create<AvisoState>((set) => ({
  aviso: null,
  avisar: (texto) => {
    clearTimeout(temporizador);
    set({ aviso: { id: Date.now(), texto } });
    temporizador = setTimeout(() => set({ aviso: null }), DURACAO_MS);
  },
  fechar: () => {
    clearTimeout(temporizador);
    set({ aviso: null });
  },
}));

/** Atalho fora de componentes (ex.: no onSuccess de uma mutação). */
export const avisar = (texto: string) => useAvisoStore.getState().avisar(texto);
