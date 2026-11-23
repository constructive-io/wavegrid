import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { defineConfig } from 'vite';

// In dev, proxy /api to the running wavegrid server. `changeOrigin` rewrites
// the Host header to the target, so the server's /api/config reports its own
// origin as the WebSocket URL (ws://localhost:3000) and the browser dials the
// server directly — no WebSocket proxy needed, and it mirrors production, where
// the wavegrid server serves this build's static assets + WS on one origin.
const WG_DEV_SERVER = process.env.WG_DEV_SERVER || 'http://localhost:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  server: {
    port: 3003,
    proxy: {
      '/api': { target: WG_DEV_SERVER, changeOrigin: true },
      '/plugins': { target: WG_DEV_SERVER, changeOrigin: true }
    }
  }
});
