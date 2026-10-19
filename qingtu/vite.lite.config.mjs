import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
const here=process.cwd();
const aliases=[['sharp','src/lite/sharp.mjs'],['node:fs/promises','src/lite/node-fs.mjs'],['node:path','node_modules/path-browserify/index.js'],['node:crypto','src/lite/node-crypto.mjs'],['wasm-vips','src/lite/vips-loader.mjs']].map(([find,replacement])=>({find,replacement:path.join(here,replacement)}));
export default defineConfig({base:'./',resolve:{alias:aliases},build:{outDir:'dist/lite',target:'safari16.4'},worker:{format:'es',plugins:()=>[],rollupOptions:{output:{manualChunks(id){if(id.includes('/src/lite/native-rpc')||id.includes('/node_modules/buffer/')||id.includes('/node_modules/base64-js/')||id.includes('/node_modules/ieee754/'))return 'lite-common';}}},},plugins:[react(),{name:'lite-entry',transformIndexHtml:{order:"pre",handler(html){return html.replace('/src/main.jsx','/src/lite/main.jsx').replace("script-src 'self'","script-src 'self' 'wasm-unsafe-eval'").replace("connect-src 'self' ws:","connect-src 'self' ws:; worker-src 'self' blob:");}}}]});
