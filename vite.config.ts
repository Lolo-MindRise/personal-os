import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { apiProxy } from './src/web/devProxy.js';

const apiPort = process.env.PORT ?? '5310';
// Overridable so the e2e dev server never collides with a running `npm run dev`.
const webPort = Number(process.env.VITE_PORT ?? '5173');

export default defineConfig({
  root: fileURLToPath(new URL('./src/web', import.meta.url)),
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL('./dist/web', import.meta.url)),
    emptyOutDir: true,
  },
  server: {
    host: '127.0.0.1',
    port: webPort,
    strictPort: true,
    proxy: apiProxy(apiPort),
  },
});
