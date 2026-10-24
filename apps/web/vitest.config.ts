import { resolve } from 'node:path'

import { defineConfig } from 'vite-plus'
import { playwright } from 'vite-plus/test/browser-playwright'
import react from '@vitejs/plugin-react'
import { inlangToIcu } from './src/i18n/inlang-to-icu'

export default defineConfig({
  cacheDir: resolve(import.meta.dirname, '../../tmp/vite/web'),
  plugins: [
    // eslint-disable-next-line typescript/no-explicit-any
    react() as any,
    // The app converts the inlang (Paraglide) catalogs to ICU when it loads them (src/i18n/request.ts);
    // tests import the JSON directly, so they get the same conversion here.
    {
      name: 'inlang-catalogs-as-icu',
      enforce: 'pre',
      transform(code: string, id: string) {
        return /\/src\/messages\/[\w-]+\.json$/.test(id)
          ? { code: JSON.stringify(inlangToIcu(JSON.parse(code))), map: null }
          : undefined
      },
    },
  ],
  resolve: {
    // Vite now handles this natively, so we can remove the external plugin
    tsconfigPaths: true,
    alias: {
      'next/navigation': 'next/dist/client/components/navigation.js',
    },
  },
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          setupFiles: ['./src/tests/setup-node.ts'],
          include: ['src/tests/**/*.test.ts'],
          exclude: ['src/tests/editor/**', 'src/tests/lib/api-client.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'components',
          environment: 'jsdom',
          setupFiles: ['./src/tests/setup.ts'],
          include: ['src/tests/**/*.test.tsx', 'src/tests/editor/**/*.test.ts', 'src/tests/lib/api-client.test.ts'],
        },
      },
    ],
    testTimeout: 10_000,
    maxWorkers: 4,
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
})
