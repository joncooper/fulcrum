import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(__dirname, "src/web"),
  publicDir: false,
  build: {
    outDir: resolve(__dirname, "dist/web"),
    emptyOutDir: true,
    sourcemap: true,
  },
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:3737",
    },
  },
});
