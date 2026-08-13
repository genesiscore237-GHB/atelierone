import { defineConfig } from 'vitest/config';
import path from 'path';

process.env.DATABASE_URL ??= 'postgres://localhost:5432/atelierone_test';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['e2e/**', 'node_modules/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '~': path.resolve(__dirname, './src'),
    },
  },
});