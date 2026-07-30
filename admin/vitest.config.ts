import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_NAKAMA_KEY': JSON.stringify('test-key'),
    'import.meta.env.VITE_USE_PROXY': JSON.stringify('false'),
    'import.meta.env.VITE_NAKAMA_HOST': JSON.stringify('localhost'),
    'import.meta.env.VITE_NAKAMA_PORT': JSON.stringify('7350'),
    'import.meta.env.VITE_NAKAMA_SSL': JSON.stringify('false'),
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
});
