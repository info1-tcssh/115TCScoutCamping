import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'server-time-api',
        configureServer(server) {
          server.middlewares.use('/api/server-time', (req, res) => {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            res.end(JSON.stringify({
              timestamp: Date.now(),
              taiwanIso: new Date(Date.now() + 8 * 3600 * 1000).toISOString().replace('Z', '+08:00'),
            }));
          });
        },
        configurePreviewServer(server) {
          server.middlewares.use('/api/server-time', (req, res) => {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            res.end(JSON.stringify({
              timestamp: Date.now(),
              taiwanIso: new Date(Date.now() + 8 * 3600 * 1000).toISOString().replace('Z', '+08:00'),
            }));
          });
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
