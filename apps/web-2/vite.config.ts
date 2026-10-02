import { paraglideVitePlugin } from '@inlang/paraglide-js'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact, { reactCompilerPreset } from '@vitejs/plugin-react'
import { defineConfig, lazyPlugins, type Plugin } from 'vite-plus'
import type { OxlintConfig } from 'vite-plus/lint'
import { playwright } from 'vite-plus/test/browser-playwright'

import { paraglideOptions } from './gates/codegen.ts'

// Dev is same-origin like prod: the API stack (`just dev-up`) sits behind the dev server's proxy.
const apiTarget = process.env['API_PROXY_TARGET'] ?? 'http://127.0.0.1:8000'
const proxy = Object.fromEntries(
  ['/api/v2', '/content', '/ab-public', '/ab-private'].map(path => [path, { target: apiTarget, changeOrigin: true }]),
)

// Spec 7.4: responses are validated with the generated Valibot schemas in dev and tests only.
// The production build drops the per-operation validators so the schemas tree-shake out.
const VALIDATOR_LINE = /^\s*responseValidator: async \(data\) => await v\.parseAsync\(\w+, data\),\n/gm
const stripResponseValidators: Plugin = {
  name: 'ab:strip-response-validators',
  apply: 'build',
  transform(code, id) {
    if (!id.replaceAll('\\', '/').endsWith('/shared/api/gen/sdk.gen.ts')) return null
    const stripped = code.replaceAll(VALIDATOR_LINE, '')
    if (stripped.includes('responseValidator'))
      this.error('sdk.gen.ts changed shape: update VALIDATOR_LINE in vite.config.ts')
    return { code: stripped, map: null }
  },
}

const plugins = lazyPlugins(() => [
  paraglideVitePlugin(paraglideOptions),
  tailwindcss(),
  tanstackStart(),
  viteReact(),
  babel({ presets: [reactCompilerPreset()] }),
  stripResponseValidators,
])

const unit = {
  name: 'unit',
  include: ['src/**/*.test.{ts,tsx}', 'gates/**/*.test.ts'],
  exclude: ['**/*.browser.test.*'],
}
const browser = {
  name: 'browser',
  include: ['src/**/*.browser.test.{ts,tsx}'],
  browser: { enabled: true, headless: true, provider: playwright(), instances: [{ browser: 'chromium' as const }] },
}

// ---- Lint (G-01, spec 7.2-7.3). Every rule is an error; each message names the one allowed way. ----
const SDK = 'HTTP to the API goes through the generated SDK (#/shared/api/gen) on top of #/shared/api/client.ts.'
const ROUTER_URL = 'URL state: validateSearch (Valibot) + Link / navigate({ search }); navigation via the router.'
const FORMAT = 'Format dates and numbers with #/shared/i18n/format.ts (platform time zone Asia/Almaty).'
const STORAGE = 'Browser storage goes through storageItem() from #/shared/lib/storage.ts.'
const TIMERS =
  'No hand-made timers or polling: TanStack Pacer for debounce/throttle; Query + the event stream for freshness.'
const FEATURE_INDEX =
  'Import another feature only through its index: #/features/<name>. Inside a feature use relative paths.'

type Rules = NonNullable<OxlintConfig['rules']>

const globals = {
  fetch: SDK,
  XMLHttpRequest: SDK,
  EventSource: 'Live updates come from #/shared/api/events.ts (one stream per tab).',
  localStorage: STORAGE,
  sessionStorage: STORAGE,
  location: ROUTER_URL,
  history: ROUTER_URL,
  URLSearchParams: ROUTER_URL,
  Intl: FORMAT,
  setInterval: TIMERS,
  setTimeout: TIMERS,
}
const restrictGlobals = (...allowed: string[]): Rules['no-restricted-globals'] => [
  'error',
  {
    checkGlobalObject: true,
    globalObjects: ['window', 'globalThis', 'self'],
    globals: Object.entries(globals)
      .filter(([name]) => !allowed.includes(name))
      .map(([name, message]) => ({ name, message })),
  },
]

const properties = [
  { object: 'document', property: 'cookie', message: STORAGE },
  { property: 'toLocaleString', message: FORMAT },
  { property: 'toLocaleDateString', message: FORMAT },
  { property: 'toLocaleTimeString', message: FORMAT },
  {
    property: 'invalidateQueries',
    message: 'Declare meta: { invalidates: [xQueryKey()] } on the mutation; one MutationCache handler invalidates.',
  },
  { object: 'vi', property: 'mock', message: 'Do not mock modules: test the real module; stub the network at fetch.' },
]
const restrictProperties = (...allowed: string[]): Rules['no-restricted-properties'] => [
  'error',
  ...properties.filter(entry => !allowed.includes(entry.property)),
]

const paths = [
  { name: 'react', importNames: ['useMemo', 'useCallback', 'memo'], message: 'React Compiler memoizes: remove it.' },
  { name: '@tanstack/react-start', importNames: ['createServerFn'], message: `The web server serves no data. ${SDK}` },
  {
    name: '@tanstack/react-query',
    importNames: ['useQuery', 'useInfiniteQuery'],
    message: 'Read with loader ensureQueryData(xOptions()) + useSuspenseQuery / useSuspenseInfiniteQuery.',
  },
  { name: 'zod', message: 'Schemas are Valibot, generated from the contract: #/shared/api/gen/valibot.gen.ts.' },
  { name: 'date-fns', message: FORMAT },
]
const layerPatterns = {
  any: [{ regex: '^(\\.\\./)+(shared|features|routes)/', message: 'Cross-layer imports use the #/ alias.' }],
  shared: [
    {
      regex: '^#/(features|routes)/',
      message: 'shared/ must not import features/ or routes/ (one-way: routes -> features -> shared).',
    },
  ],
  features: [
    { regex: '^#/routes/', message: 'features/ must not import routes/ (one-way: routes -> features -> shared).' },
    { regex: '^#/features/[^/]+/.', message: FEATURE_INDEX },
    { regex: '^@tanstack/react-start/server$', message: 'Server request APIs stay in src/server.ts and shared/.' },
  ],
  routes: [{ regex: '^#/features/[^/]+/.', message: FEATURE_INDEX }],
}
const restrictImports = (layer: keyof typeof layerPatterns): Rules['no-restricted-imports'] => [
  'error',
  { paths, patterns: [...layerPatterns.any, ...(layer === 'any' ? [] : layerPatterns[layer])] },
]

const forbiddenElements = ['button', 'input', 'select', 'textarea', 'dialog', 'table', 'a'].map(element => ({
  element,
  message: `Use the kit component from #/shared/ui (or Link from @tanstack/react-router for <a>), not raw <${element}>.`,
}))

const lint: OxlintConfig = {
  plugins: ['eslint', 'typescript', 'oxc', 'react', 'jsx-a11y', 'import', 'promise', 'unicorn', 'vitest'],
  jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }, './gates/lint-plugin.ts'],
  categories: { correctness: 'error', suspicious: 'error' },
  options: { typeAware: true, typeCheck: true },
  ignorePatterns: ['src/shared/api/gen/**', 'src/paraglide/**', 'src/routeTree.gen.ts', 'dist/**'],
  rules: {
    'vite-plus/prefer-vite-plus-imports': 'error',
    'react/react-in-jsx-scope': 'off',
    'ab/no-jsx-literal': 'error',
    'ab/no-empty-fallback': 'error',
    'ab/no-literal-query-key': 'error',
    'ab/no-dynamic-message': 'error',
    'max-lines': ['error', { max: 300 }],
    'max-lines-per-function': ['error', { max: 80 }],
    'typescript/no-floating-promises': 'error',
    'typescript/no-explicit-any': 'error',
    'import/no-default-export': 'error',
    'import/no-cycle': 'error',
    'unicorn/filename-case': ['error', { case: 'kebabCase' }],
    'no-console': 'error',
    'no-empty': 'error',
    'react/no-danger': 'error',
    'react/no-multi-comp': 'error',
    'react/forbid-elements': ['error', { forbid: forbiddenElements }],
    'react/forbid-dom-props': [
      'error',
      { forbid: [{ propName: 'style', message: 'Use Tailwind classes on tokens.' }] },
    ],
    'no-restricted-globals': restrictGlobals(),
    'no-restricted-properties': restrictProperties(),
    'no-restricted-imports': restrictImports('any'),
  },
  overrides: [
    { files: ['**/*.test.ts', '**/*.test.tsx'], rules: { 'max-lines': ['error', { max: 500 }] } },
    { files: ['src/shared/**'], rules: { 'no-restricted-imports': restrictImports('shared') } },
    { files: ['src/features/**'], rules: { 'no-restricted-imports': restrictImports('features') } },
    {
      files: ['src/routes/**'],
      rules: { 'no-restricted-imports': restrictImports('routes'), 'unicorn/filename-case': 'off' },
    },
    { files: ['src/shared/api/**'], rules: { 'no-restricted-globals': restrictGlobals('fetch') } },
    {
      files: ['src/shared/lib/storage.ts', 'src/shared/lib/storage.browser.test.ts'],
      rules: { 'no-restricted-globals': restrictGlobals('localStorage', 'sessionStorage') },
    },
    { files: ['src/shared/lib/client-errors.ts'], rules: { 'no-restricted-globals': restrictGlobals('location') } },
    {
      files: ['src/shared/i18n/format.ts'],
      rules: {
        'no-restricted-globals': restrictGlobals('Intl'),
        'no-restricted-properties': restrictProperties('toLocaleString', 'toLocaleDateString', 'toLocaleTimeString'),
      },
    },
    {
      files: ['src/shared/api/query-client.ts'],
      rules: { 'no-restricted-properties': restrictProperties('invalidateQueries') },
    },
    { files: ['src/shared/ui/**'], rules: { 'react/forbid-elements': 'off' } },
    {
      // Tools that require a default export.
      files: [
        'vite.config.ts',
        'openapi-ts.config.ts',
        'e2e/playwright.config.ts',
        'src/server.ts',
        'gates/lint-plugin.ts',
      ],
      rules: { 'import/no-default-export': 'off' },
    },
  ],
}

// `vp staged` (pre-commit) formats staged files; generated output is never reformatted.
const GENERATED = /\/(shared\/api\/gen|paraglide|themes)\/|routeTree\.gen\.ts$|BACKLOG\.md$/
const formatStaged = (files: readonly string[]) => {
  const targets = files.filter(file => !GENERATED.test(file.replaceAll('\\', '/')))
  return targets.length === 0 ? [] : `vp fmt --write ${targets.map(file => JSON.stringify(file)).join(' ')}`
}

export default defineConfig({
  ...(plugins ? { plugins } : {}),
  staged: { '*.{ts,tsx,js,mjs,json,jsonc,css,md}': formatStaged },
  server: { port: 3000, strictPort: true, proxy },
  build: { manifest: true },
  test: {
    projects: [
      { extends: true, test: unit },
      { extends: true, test: browser },
    ],
  },
  lint,
  fmt: {
    printWidth: 120,
    semi: false,
    singleQuote: true,
    trailingComma: 'all',
    arrowParens: 'avoid',
    endOfLine: 'lf',
    sortPackageJson: false,
    sortTailwindcss: { stylesheet: 'src/styles/globals.css' },
    ignorePatterns: [
      'src/shared/api/gen/',
      'src/paraglide/',
      'src/routeTree.gen.ts',
      'dist/',
      'node_modules/',
      'test-results/',
      'playwright-report/',
      'BACKLOG.md',
      // Generated from the legacy theme store (phase 1.1); byte-stable generator output.
      'public/themes/',
    ],
  },
})
