import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Vite now handles this natively, so we can remove the external plugin
    tsconfigPaths: true,
    alias: {
      'next/navigation': 'next/dist/client/components/navigation.js',
    },
  },
  test: {
    globals: true,
    setupFiles: ['./src/tests/setup.ts'],
    environment: 'jsdom',
    include: ['src/tests/**/*.test.{ts,tsx}'],
    server: {
      deps: {
        inline: ['next-intl'],
      },
    },

    browser: {
      enabled: false,
      provider: playwright(),
      headless: !!process.env.CI,
      // Fix: Added the mandatory "name" property to each instance
      instances: [
        { name: 'chromium', browser: 'chromium' },
        { name: 'firefox', browser: 'firefox' },
        { name: 'webkit', browser: 'webkit' },
      ],
    },
  },
});
