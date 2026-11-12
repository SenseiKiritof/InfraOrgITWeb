import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:5298",
        ws: true,
      },
      "/auth": "http://localhost:5298",
      // Keycloak through the Vite origin so the desktop child window never
      // performs a cross-origin redirect before login. Keep the Host header
      // (changeOrigin: false) so Keycloak generates localhost:3000 URLs.
      "/realms": {
        target: "http://localhost:18081",
        changeOrigin: false,
      },
      "/resources": {
        target: "http://localhost:18081",
        changeOrigin: false,
      },
    },
  },
});
