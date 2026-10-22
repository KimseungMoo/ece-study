import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

const BASE = '/ece-study/';
const useSample = process.env.ECE_DATA === 'sample';
const sampleDir = resolve(import.meta.dirname, 'fixtures/sample');

function sampleDataPlugin() {
  return {
    name: 'ece-sample-data',
    configureServer(server) {
      if (!useSample) return;
      const handle = (req, res, next) => {
        const url = req.url || '';
        const prefix = `${BASE}data/`;
        if (!url.startsWith(prefix)) return next();
        const name = decodeURIComponent(url.slice(prefix.length).split('?')[0]);
        if (!name || name.includes('..')) return next();
        const file = resolve(sampleDir, name);
        if (!file.startsWith(sampleDir) || !existsSync(file)) return next();
        import('node:fs').then((fs) => {
          const type = name.endsWith('.json') ? 'application/json' : 'application/octet-stream';
          res.setHeader('Content-Type', type);
          res.setHeader('Cache-Control', 'no-store');
          fs.createReadStream(file).pipe(res);
        });
      };
      server.middlewares.use(handle);
      const layer = server.middlewares.stack.pop();
      server.middlewares.stack.unshift(layer);
    },
  };
}

export default defineConfig({
  base: BASE,
  plugins: [
    sampleDataPlugin(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['apple-touch-icon.png', 'favicon.png', 'icons/*.png'],
      manifest: {
        name: '전기공사 기출',
        short_name: '전기공사 기출',
        description: '전기공사산업기사 개인 학습',
        lang: 'ko',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'any',
        background_color: '#121820',
        theme_color: '#121820',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      devOptions: { enabled: false },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff,woff2,ttf,png,svg}'],
        globIgnores: ['**/data/**'],
        navigateFallback: `${BASE}index.html`,
        navigateFallbackDenylist: [/^\/ece-study\/data\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.pathname.startsWith(`${BASE}data/`) && !/\/img-\d+\.bin$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'ece-data-core',
              expiration: { maxEntries: 8 },
            },
          },
          {
            urlPattern: ({ url }) => /\/ece-study\/data\/img-\d+\.bin$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'ece-img-chunks',
              expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  server: { port: 5173 },
  preview: { port: 4173 },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
