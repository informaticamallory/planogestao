import * as SecureStore from "expo-secure-store";

/**
 * Refresh token no armazenamento seguro do sistema (Keychain no iOS, Keystore no Android).
 * O access token nunca é persistido: fica só em memória (authStore) e é renovado pelo refresh.
 */
const CHAVE_REFRESH = "planogestao.refresh_token";
const OPCOES: SecureStore.SecureStoreOptions = {
  // Só neste aparelho e só com ele desbloqueado; não vai para backups/restaurações em outro aparelho.
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export const sessaoSegura = {
  lerRefreshToken: () => SecureStore.getItemAsync(CHAVE_REFRESH, OPCOES),
  salvarRefreshToken: (token: string) => SecureStore.setItemAsync(CHAVE_REFRESH, token, OPCOES),
  apagarRefreshToken: () => SecureStore.deleteItemAsync(CHAVE_REFRESH, OPCOES),
};
