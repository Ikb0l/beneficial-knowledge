import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('framer-motion')) return 'motion';
          if (id.includes('@sentry')) return 'sentry';
          if (id.includes('@heroiclabs/nakama-js')) return 'nakama';
          if (id.includes('i18next') || id.includes('react-i18next')) return 'i18n';
          if (id.includes('zustand')) return 'state';
          if (id.includes('howler')) return 'audio';
          return 'vendor';
        },
      },
    },
  },
  server: {
    port: 5200,
    host: true, // Allow external connections
    allowedHosts: true, // Allow all hosts (tunnels)
    proxy: {
      // Proxy Nakama HTTP API
      '/v2': {
        target: 'http://localhost:7350',
        changeOrigin: true,
      },
      // Proxy Nakama WebSocket
      '/ws': {
        target: 'ws://localhost:7350',
        ws: true,
      },
    },
  },
})
