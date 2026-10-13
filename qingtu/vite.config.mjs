import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { devBridge } from './scripts/dev-bridge.mjs';

export default defineConfig({
  base: './',
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    watch: { ignored: ['**/release/**', '**/artifacts/**'] },
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react(), devBridge()],
});
