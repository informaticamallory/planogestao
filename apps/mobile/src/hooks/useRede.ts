import { useNetInfo } from "@react-native-community/netinfo";

/**
 * Aparelho sem nenhuma rede (Wi-Fi/dados desligados ou sem sinal).
 * Usa só `isConnected`: `isInternetReachable` testa a internet pública e daria falso "offline"
 * numa rede interna sem saída para a internet, onde a API continua acessível.
 * Enquanto o NetInfo ainda não sabe (null), considera online para não piscar o aviso na abertura.
 * Servidor fora do ar com rede presente é tratado pelo erro da própria requisição.
 */
export function useRede() {
  const { isConnected } = useNetInfo();
  return { offline: isConnected === false };
}
