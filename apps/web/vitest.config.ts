import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import react from '@vitejs/plugin-react';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  test: {
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    environment: 'jsdom',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    browser: {
      enabled: false, // Default to false, can be overridden by --browser
      provider: playwright(),
      instances: [{ browser: 'chromium' }, { browser: 'firefox' }, { browser: 'webkit' }],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      '@components': path.resolve(__dirname, 'components'),
      '@services': path.resolve(__dirname, 'services'),
      '@public': path.resolve(__dirname, 'public'),
    },
  },
}));
