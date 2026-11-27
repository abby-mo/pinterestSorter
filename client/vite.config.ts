import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // The OAuth redirect URI points at this proxy, so the whole app
      // (including the Pinterest callback) lives on one origin.
      '/api': { target: 'http://127.0.0.1:3001', changeOrigin: false },
    },
  },
});
