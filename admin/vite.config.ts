import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('recharts')) return 'charts';
          if (id.includes('@heroiclabs/nakama-js')) return 'nakama';
          if (id.includes('zustand')) return 'state';
          if (id.includes('date-fns')) return 'date';
          return 'vendor';
        },
      },
    },
  },
  server: {
    port: 3001,
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
