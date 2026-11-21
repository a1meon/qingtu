import { readFileSync } from 'node:fs';
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { devBridge } from './scripts/dev-bridge.mjs';

export default defineConfig({
  base: './',
  worker: {format: 'es'},
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "127.0.0.1",
    watch: { ignored: ['**/release/**', '**/artifacts/**'] },
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react(), devBridge(), {
    name: 'browser-codec-notices',
    generateBundle() {
      const source = ['LICENSE', 'NOTICE'].map(name =>
        readFileSync(new URL(`./node_modules/@imagemagick/magick-wasm/${name}`, import.meta.url), 'utf8')
      ).join('\n');
      this.emitFile({type: 'asset', fileName: 'assets/browser-codec-notices.txt', source});
    },
  }],
});
