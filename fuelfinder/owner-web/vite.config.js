import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    open: false,
    proxy: {
      // Dev-only: avoid browser CORS when hitting the Render backend from localhost.
      "/api": {
        target: "https://fuelfinder-2.onrender.com",
        changeOrigin: true,
        secure: true,
        configure(proxy) {
          proxy.on("proxyReq", (proxyReq) => {
            // Render backend CORS allowlist may reject localhost origins.
            // Strip the browser Origin so the backend treats it as a server-to-server request.
            proxyReq.removeHeader("origin");
          });
        }
      }
    }
  }
});
