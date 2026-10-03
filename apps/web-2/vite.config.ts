import { Agent } from 'node:http'

import { paraglideVitePlugin } from '@inlang/paraglide-js'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact, { reactCompilerPreset } from '@vitejs/plugin-react'
import { defineConfig, lazyPlugins } from 'vite-plus'
import type { OxlintConfig } from 'vite-plus/lint'
import { playwright } from 'vite-plus/test/browser-playwright'

import { paraglideOptions } from './gates/codegen.ts'
import { initialModules, ROUTE_SPLIT, stripResponseValidators } from './gates/bundle.ts'

// Dev is same-origin like prod: the API (`just dev-up`) and storage sit behind the dev server's proxy.
const apiTarget = process.env['API_PROXY_TARGET'] ?? 'http://127.0.0.1:8000'
// Storage as nginx serves it (buckets, `/content/<key>`); kept-alive sockets (one per request exhausted ports in e2e).
const agent = new Agent({ keepAlive: true })
const storage = { target: process.env['STORAGE_PROXY_TARGET'] ?? 'http://localhost:9002', changeOrigin: true, agent }
const proxy = {
  '/api/v2': { target: apiTarget, changeOrigin: true, agent },
  '/ab-public': storage,
  '/ab-private': storage,
  '/content': { ...storage, rewrite: (path: string) => path.replace(/^\/content\//, '/ab-public/') },
}

const plugins = lazyPlugins(() => [
  paraglideVitePlugin(paraglideOptions),
  tailwindcss(),
  tanstackStart({ router: { codeSplittingOptions: { defaultBehavior: ROUTE_SPLIT } } }),
  viteReact(),
  babel({ presets: [reactCompilerPreset()] }),
  stripResponseValidators,
  initialModules(),
])

const unit = {
  name: 'unit',
  include: ['src/**/*.test.{ts,tsx}', 'gates/**/*.test.ts'],
  exclude: ['**/*.browser.test.*', '**/*.themes.test.*'],
}
const chromium = {
  enabled: true,
  headless: true,
  provider: playwright(),
  instances: [{ browser: 'chromium' as const }],
}
// 30 s: a file's first test loads lazy chunks (Tiptap, shiki) while other worktrees verify; 15 s timed out.
const browser = { name: 'browser', include: ['src/**/*.browser.test.{ts,tsx}'], browser: chromium, testTimeout: 30_000 }
// G-15 (spec 9) is a phase gate, not part of `vp test run`: `bun run g15` sets G15.
const themes = { name: 'themes', include: ['src/**/*.themes.test.{ts,tsx}'], browser: chromium }

// ---- Lint (G-01, spec 7.2-7.3). Every rule is an error; each message names the one allowed way. ----
const SDK = 'HTTP to the API goes through the generated SDK (#/shared/api/gen) on top of #/shared/api/client.ts.'
const ROUTER_URL = 'URL state: validateSearch (Valibot) + Link / navigate({ search }); navigation via the router.'
const FORMAT = 'Format dates and numbers with #/shared/i18n/format.ts (platform time zone Asia/Almaty).'
const STORAGE = 'Browser storage goes through storageItem() / cookieItem() from #/shared/lib/storage.ts.'
const TIMERS =
  'No hand-made timers or polling: TanStack Pacer for debounce/throttle; Query + the event stream for freshness.'
const FEATURE_INDEX =
  'Import another feature only through #/features/<name> (or its entry-chunk part #/features/<name>/route). Inside a feature use relative paths.'

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
    { regex: '^#/features/[^/]+/(?!route$).', message: FEATURE_INDEX },
    { regex: '^@tanstack/react-start/server$', message: 'Server request APIs stay in src/server.ts and shared/.' },
  ],
  routes: [{ regex: '^#/features/[^/]+/(?!route$).', message: FEATURE_INDEX }],
}
const restrictImports = (layer: keyof typeof layerPatterns): Rules['no-restricted-imports'] => [
  'error',
  { paths, patterns: [...layerPatterns.any, ...(layer === 'any' ? [] : layerPatterns[layer])] },
]

const forbiddenElements = ['button', 'input', 'select', 'textarea', 'dialog', 'table', 'a'].map(element => ({
  element,
  message: `Use the stock component from #/shared/ui or a composite from #/shared/components (Link / Anchor for <a>), not raw <${element}>.`,
}))

const LINK_COMPOSITES = ['src/shared/components/link.tsx', 'src/shared/components/anchor.tsx']
const forbiddenExceptA = forbiddenElements.filter(entry => entry.element !== 'a')

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
    { files: ['src/features/*/route.{ts,tsx}'], rules: { 'ab/route-entry-imports': 'error' } },
    {
      files: ['src/routes/**'],
      rules: {
        'no-restricted-imports': restrictImports('routes'),
        'ab/route-level-imports': 'error',
        'unicorn/filename-case': 'off',
      },
    },
    // upload.ts: XMLHttpRequest is the only browser API with upload progress (spec 7.3).
    { files: ['src/shared/api/**'], rules: { 'no-restricted-globals': restrictGlobals('fetch', 'XMLHttpRequest') } },
    {
      files: ['src/shared/lib/storage.ts', 'src/shared/lib/storage.browser.test.ts'],
      rules: {
        'no-restricted-globals': restrictGlobals('localStorage', 'sessionStorage'),
        'no-restricted-properties': restrictProperties('cookie'),
      },
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
      // events.ts: the event stream invalidates by its table "event -> keys" (spec 7.7).
      files: ['src/shared/api/query-client.ts', 'src/shared/api/events.ts'],
      rules: { 'no-restricted-properties': restrictProperties('invalidateQueries') },
    },
    // The two link composites are the one place that renders <a> (routes through createLink, other URLs plainly).
    { files: LINK_COMPOSITES, rules: { 'react/forbid-elements': ['error', { forbid: forbiddenExceptA }] } },
    {
      // Stock shadcn output (`bunx shadcn add`), owned by the generator: named relaxations for this folder only.
      files: ['src/shared/ui/**'],
      rules: {
        'react/forbid-elements': 'off',
        'react/no-multi-comp': 'off',
        'no-restricted-imports': ['error', { patterns: [...layerPatterns.any, ...layerPatterns.shared] }],
        'jsx-a11y/prefer-tag-over-role': 'off',
        'jsx-a11y/no-noninteractive-element-interactions': 'off',
        'jsx-a11y/click-events-have-key-events': 'off',
        'jsx-a11y/label-has-associated-control': 'off',
        'typescript/no-unsafe-type-assertion': 'off',
        'no-underscore-dangle': 'off',
      },
    },
    // Chromium shows no PDF in a sandboxed frame; the component frames same-origin paths only.
    { files: ['src/shared/components/pdf-frame.tsx'], rules: { 'react/iframe-missing-sandbox': 'off' } },
    {
      // Tools that require a default export.
      files: [
        'vite.config.ts',
        'openapi-ts.config.ts',
        'e2e/playwright.config.ts',
        'e2e/global-setup.ts',
        'src/server.ts',
        'gates/lint-plugin.ts',
      ],
      rules: { 'import/no-default-export': 'off' },
    },
  ],
}

// `vp staged` (pre-commit) formats staged files; generated output is never reformatted.
const GENERATED = /\/(shared\/api\/gen|shared\/ui|paraglide|themes)\/|routeTree\.gen\.ts$|BACKLOG\.md$/
const formatStaged = (files: readonly string[]) => {
  const targets = files.filter(file => !GENERATED.test(file.replaceAll('\\', '/')))
  return targets.length === 0 ? [] : `vp fmt --write ${targets.map(file => JSON.stringify(file)).join(' ')}`
}

export default defineConfig({
  ...(plugins ? { plugins } : {}),
  staged: { '*.{ts,tsx,js,mjs,json,jsonc,css,md}': formatStaged },
  server: { host: '127.0.0.1', port: 3000, strictPort: true, proxy },
  build: {
    manifest: true,
    // Spec 7.4: response schemas leave the production bundle, so an unused `v.object(...)` is dead code, but a bundler
    // cannot know valibot calls are pure. Every `v.<fn>()` result is now droppable: call a valibot side effect by its
    // named import (`setGlobalMessage` in shared/ui/form/use-app-form.ts), never as `v.<fn>()`.
    rolldownOptions: { treeshake: { manualPureFunctions: ['v'] } },
  },
  test: {
    // Several worktrees run verify at once: the fixed default port (63315) collides.
    api: { strictPort: false },
    projects: [
      { extends: true, test: unit },
      // The browser project's Vite server inherits `server.strictPort` (the dev server's): free it for parallel runs.
      { extends: true, server: { strictPort: false }, test: browser },
      ...(process.env['G15'] ? [{ extends: true, test: themes }] : []),
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
      // Stock shadcn output: kept as the CLI writes it, so `shadcn add --diff` shows only real changes.
      'src/shared/ui/',
      'components.json',
    ],
  },
})
