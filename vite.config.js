import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Spotify no acepta "localhost" como redirect URI: usamos 127.0.0.1
// En desarrollo, /api/canvas se redirige al servicio de Canvas (en producción lo hace api/canvas.js)
export default defineConfig({
  plugins: [react()],
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
