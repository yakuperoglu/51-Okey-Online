import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@okey/engine": path.resolve(rootDir, "../engine/src/index.ts"),
    },
  },
  server: {
    host: true,
    port: 5173,
    fs: { allow: [path.resolve(rootDir, "..")] },
    proxy: {
      "/socket.io": {
        target: "http://localhost:3001",
        ws: true,
        changeOrigin: true,
      },
    },
  },
  optimizeDeps: {
    exclude: ["@okey/engine"],
  },
});
