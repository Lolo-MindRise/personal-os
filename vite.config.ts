import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { ICONS, renderIconPng } from './src/server/pwaIcons.js';
import { apiProxy } from './src/web/devProxy.js';

/**
 * The app icons are drawn in code (src/server/pwaIcons.ts): emitted into dist/web/icons by the
 * build, and served by the dev server, so the repository holds no binary image files.
 */
function pwaIcons(): Plugin {
  return {
    name: 'personal-os-pwa-icons',
    configureServer(server) {
      server.middlewares.use('/icons', (request, response, next) => {
        const name = (request.url ?? '').split('?')[0]?.replace(/^\//, '');
        const spec = ICONS.find((icon) => icon.file === name);
        if (spec === undefined) {
          next();
          return;
        }
        response.setHeader('content-type', 'image/png');
        response.end(renderIconPng(spec));
      });
    },
    generateBundle() {
      for (const spec of ICONS) {
        this.emitFile({
          type: 'asset',
          fileName: `icons/${spec.file}`,
          source: renderIconPng(spec),
        });
      }
    },
  };
}

const apiPort = process.env.PORT ?? '5310';
// Overridable so the e2e dev server never collides with a running `npm run dev`.
const webPort = Number(process.env.VITE_PORT ?? '5173');

export default defineConfig({
  root: fileURLToPath(new URL('./src/web', import.meta.url)),
  plugins: [react(), pwaIcons()],
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
