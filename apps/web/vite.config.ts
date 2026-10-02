import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Porta fixa: precisa bater com CORS_ORIGINS do backend.
    strictPort: true,
  },
});
