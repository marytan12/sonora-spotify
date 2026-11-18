import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { lookupLyrics, parseQuery } from './api/_netease.js';

// En desarrollo, /api/lyrics la responde este mismo servidor con el código de api/lyrics.js
const devLyrics = {
  name: 'sonora-dev-lyrics',
  configureServer(server) {
    server.middlewares.use('/api/lyrics', async (req, res) => {
      const q = parseQuery(Object.fromEntries(new URL(req.url, 'http://x').searchParams));
      res.setHeader('Content-Type', 'application/json');
      if (!q) {
        res.statusCode = 400;
        return res.end('{"found":false}');
      }
      try {
        res.end(JSON.stringify(await lookupLyrics(q)));
      } catch {
        res.statusCode = 502;
        res.end('{"found":false}');
      }
    });
  },
};

// Spotify no acepta "localhost" como redirect URI: usamos 127.0.0.1
// En desarrollo, /api/canvas se redirige al servicio de Canvas (en producción lo hace api/canvas.js)
export default defineConfig({
  plugins: [react(), devLyrics],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api/canvas': { target: 'https://spotify-canva.vercel.app', changeOrigin: true },
    },
  },
  preview: { host: '127.0.0.1', port: 5173, strictPort: true },
});
