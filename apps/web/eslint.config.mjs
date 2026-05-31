// eslint.config.mjs
// @ts-check
import i18next from 'eslint-plugin-i18next'
import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'
import js from '@eslint/js'

// Plugins
import unusedImports from 'eslint-plugin-unused-imports'
import reactHooks from 'eslint-plugin-react-hooks'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import next from '@next/eslint-plugin-next'
import react from 'eslint-plugin-react'
import pluginQuery from '@tanstack/eslint-plugin-query'
import reactCompiler from 'eslint-plugin-react-compiler'

/* -------------------------------------------------------------------------- */
/* Shared rules                                                               */
/* -------------------------------------------------------------------------- */

const COMMON_RULES = {
  /* Next.js */
  '@next/next/no-img-element': 'warn',
  '@next/next/no-sync-scripts': 'warn',
  '@next/next/no-page-custom-font': 'warn',

  /* React Compiler */
  'react-compiler/react-compiler': 'error',

  /* React */
  'react/prop-types': 'off',
  'react/no-unescaped-entities': 'off',
  'react/jsx-no-literals': [
    'warn',
    {
      noStrings: true,
      allowedStrings: [
        '•',
        '—',
        '×',
        '✓',
        '🛠️',
        '🏆',
        '🎉',
        'XP',
        '+',
        ':',
        '/',
        '%',
        '@',
        '(',
        ')',
        '#',
        '{',
        '}',
        '.',
        '·',
        '*',
        '-',
        ',',
        '→',
        '←',
        '✨',
        '⭐',
        '...',
        '…',
        '|',
        'KB',
        'MB',
        'JSON',
        'CSV',
        '🖼',
        '"',
        'D',
        '1',
        '\\frac{',
        '\\sqrt{x}',
        '\\sum_{',
        '\\int_{',
        'x^{',
        'x_{',
        '^',
      ],
      ignoreProps: true,
    },
  ],
  'i18next/no-literal-string': [
    'warn',
    {
      mode: 'jsx-only',
      words: {
        exclude: [
          '[0-9!-/:-@[-`{-~]+',
          '[A-Z_-]+',
          /^\p{Emoji}+$/u,
          '…',
          '✓',
          '•',
          '×',
          '🎉',
          '→',
          '·',
          '✨',
          '⭐',
          '^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$',
          '^var\\(--.*\\)$',
          '^\\d+(\\.\\d+)?(px|rem|em|vh|vw|%|s|ms|deg)?$',
          '^[a-zA-Z0-9_-]+\\.[a-zA-Z0-9_-]+$',
          
          // Kebab-case, snake_case and camelCase words (almost entirely technical identifiers or CSS classes)
          '^[a-z0-9]+(-[a-z0-9]+)+$',
          '^[a-z0-9]+(_[a-z0-9]+)+$',
          '^[a-z0-9]+[A-Z][a-zA-Z0-9]*$',

          // Relative paths, URLs, CSS selectors, and date pattern placeholders
          '^\\/.*$',
          '^[yMdHmsS\\-:\\s]+$',
          '^input\\[.*\\]$',

          // Common standard layout, form, visual, and config string values
          '^all$',
          '^backlog$',
          '^light$',
          '^dark$',
          '^outline$',
          '^default$',
          '^secondary$',
          '^ghost$',
          '^link$',
          '^sm$',
          '^lg$',
          '^icon$',
          '^logo$',
          '^image$',
          '^video$',
          '^work$',
          '^violations$',
          '^text$',
          '^number$',
          '^date$',
          '^checkbox$',
          '^radio$',
          '^submit$',
          '^button$',
          '^email$',
          '^password$',
          '^utf8$',
          '^true$',
          '^false$',
          '^null$',
          '^undefined$',
          '^table$',
          '^list$',
          '^new$',
          '^open$',
          '^closed$',
          '^asc$',
          '^desc$',
          '^horizontal$',
          '^vertical$',
          '^none$',
          '^auto$',
          '^hidden$',
          '^visible$',
          '^row$',
          '^col$',
          '^cell$',
          '^width$',
          '^height$',
          '^top$',
          '^bottom$',
          '^left$',
          '^right$',
          '^center$',
          '^middle$',
          '^present$',
          '^Present$',
          '^—$',
          '^–$',
        ],
      },
      'jsx-attributes': {
        exclude: [
          'className',
          'id',
          'style',
          'variant',
          'href',
          'size',
          'key',
          'ref',
          'type',
          'src',
          'target',
          'rel',
          'color',
          'align',
          'justify',
          'gap',
          'breadcrumbType',
          'translationNamespace',
          'initial',
          'animate',
          'exit',
          'layout',
          'variants',
          'transition',
          'position',
          'mode',
          'as',
          'asChild',
          'priority',
          'loading',
          'height',
          'width',
          'minHeight',
          'maxHeight',
          'minWidth',
          'maxWidth',
          'strokeDasharray',
          'stroke',
          'fill',
          'sizes',
          'htmlFor',
          'name',
          'value',
          'defaultValue',
          'iconColor',
          'csvFileName',
          'storageKey',
          'path',
          'action',
          'nameKey',
          'dataKey',
          'valueKey',
          'resolvedTheme',
          'itemNoun',
          'aspectRatio',
          'lang',
          'dir',
          'orientation',
          'placement',
          'side',
          'sideOffset',
          'alignOffset',
          'scrollBehavior',
          'pointerEvents',
          'shortcut',
          '^data-.*',
          '^aria-.*',
        ],
      },
      'object-properties': {
        exclude: [
          'className',
          'id',
          'style',
          'variant',
          'href',
          'size',
          'key',
          'ref',
          'type',
          'src',
          'target',
          'rel',
          'color',
          'align',
          'justify',
          'gap',
          'breadcrumbType',
          'translationNamespace',
          'initial',
          'animate',
          'exit',
          'layout',
          'variants',
          'transition',
          'position',
          'mode',
          'as',
          'asChild',
          'priority',
          'loading',
          'height',
          'width',
          'minHeight',
          'maxHeight',
          'minWidth',
          'maxWidth',
          'strokeDasharray',
          'stroke',
          'fill',
          'sizes',
          'htmlFor',
          'name',
          'value',
          'defaultValue',
          'iconColor',
          'csvFileName',
          'storageKey',
          'path',
          'action',
          'nameKey',
          'dataKey',
          'valueKey',
          'resolvedTheme',
          'itemNoun',
          'aspectRatio',
          'lang',
          'dir',
          'orientation',
          'placement',
          'side',
          'sideOffset',
          'alignOffset',
          'scrollBehavior',
          'pointerEvents',
          'shortcut',
          '^data-.*',
          '^aria-.*',
        ],
      },
      callees: {
        exclude: [
          't',
          'tGeneral',
          'tCommon',
          'tSections',
          'tTab',
          'tColumns',
          'tForm',
          'tActions',
          'tNotifications',
          'tDialog',
          'tErrors',
          'tSuccess',
          'cn',
          'cva',
          'clsx',
          'buttonVariants',
          'router.push',
          'document.getElementById',
          'closest',
          'getAbsoluteUrl',
          'replace',
          'join',
          'isActive',
          'insertContentAt',
        ],
      },
    },
  ],
  'react/self-closing-comp': 'warn',
  'react/jsx-boolean-value': ['warn', 'never'],
  'react/no-array-index-key': 'off',
  'react/no-danger': 'off',

  /* React Hooks */
  'react-hooks/rules-of-hooks': 'error',
  'react-hooks/exhaustive-deps': 'warn',

  /* Accessibility */
  'jsx-a11y/alt-text': 'warn',
  'jsx-a11y/no-autofocus': 'warn',
  'jsx-a11y/anchor-is-valid': 'warn',

  /* Imports */
  'unused-imports/no-unused-imports': 'warn',
  'unused-imports/no-unused-vars': 'off',

  /* Code quality */
  'no-console': 'off',
  'no-unused-expressions': ['warn', { allowShortCircuit: true, allowTernary: true }],
  'no-empty': ['warn', { allowEmptyCatch: false }],
  'no-unused-vars': 'off',

  /* ── Rules disabled because they are covered by oxlint ── */
  'no-var': 'off',
  'prefer-const': 'off',
  eqeqeq: 'off',
  'no-redeclare': 'off',
  'no-extra-boolean-cast': 'off',
  'no-regex-spaces': 'off',
  'no-useless-catch': 'off',
  'no-useless-computed-key': 'off',
  'no-useless-concat': 'off',
  'no-useless-rename': 'off',
  'object-shorthand': 'off',
  'no-unreachable': 'off',
}

/* -------------------------------------------------------------------------- */
/* Config                                                                     */
/* -------------------------------------------------------------------------- */

export default defineConfig(
  /* ------------------------------------------------------------------------ */
  /* Global ignores                                                           */
  /* ------------------------------------------------------------------------ */

  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/out/**',
      '**/build/**',
      'next-env.d.ts',
      '*.config.{js,mjs,cjs,ts}',
      'src\\lib\\api\\generated\\schema.ts',
    ],
  },

  /* ------------------------------------------------------------------------ */
  /* ESLint recommended                                                       */
  /* ------------------------------------------------------------------------ */

  js.configs.recommended,

  /* ------------------------------------------------------------------------ */
  /* TanStack Query strict                                                    */
  /* ------------------------------------------------------------------------ */

  ...pluginQuery.configs['flat/recommended-strict'],

  /* ------------------------------------------------------------------------ */
  /* TypeScript recommended (typed)                                           */
  /* ------------------------------------------------------------------------ */

  ...tseslint.configs.recommendedTypeChecked,

  /* ------------------------------------------------------------------------ */
  /* Base language options                                                    */
  /* ------------------------------------------------------------------------ */

  {
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      react,
      'react-hooks': /** @type {any} */ (reactHooks),
      'react-compiler': reactCompiler,
      '@next/next': next,
      'unused-imports': unusedImports,
      'jsx-a11y': /** @type {any} */ (jsxA11y),
      i18next,
    },

    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        projectService: true,
        ecmaFeatures: { jsx: true },
      },
    },

    settings: {
      react: { version: 'detect' },
    },
  },

  /* ------------------------------------------------------------------------ */
  /* JavaScript / JSX                                                         */
  /* ------------------------------------------------------------------------ */

  {
    name: 'js/jsx',
    files: ['**/*.{js,jsx,mjs,cjs}'],

    extends: [tseslint.configs.disableTypeChecked],

    rules: /** @type {any} */ (COMMON_RULES),
  },

  /* ------------------------------------------------------------------------ */
  /* TypeScript / TSX                                                         */
  /* ------------------------------------------------------------------------ */

  {
    name: 'ts/tsx',
    files: ['**/*.{ts,tsx}'],

    rules: /** @type {any} */ ({
      ...COMMON_RULES,

      /* TypeScript */

      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/triple-slash-reference': 'warn',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/promise-function-async': 'off',
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        {
          prefer: 'type-imports',
          fixStyle: 'inline-type-imports',
        },
      ],

      /* Disable core rules replaced by TS or oxlint */

      'no-undef': 'off',
      'no-redeclare': 'off',

      '@typescript-eslint/no-redeclare': 'off', // oxlint runs correctness on TS files too

      // Should enable at some point
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-redundant-type-constituents': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/only-throw-error': 'off',
      '@typescript-eslint/no-unsafe-enum-comparison': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/prefer-promise-reject-errors': 'off',
    }),
  },

  /* ------------------------------------------------------------------------ */
  /* Course guard                                                             */
  /* ------------------------------------------------------------------------ */

  {
    name: 'course-management-design-guard',

    files: [
      'app/(platform)/dash/courses/**/*.{ts,tsx}',
      'components/Dashboard/Courses/**/*.{ts,tsx}',
      'components/Dashboard/Pages/Course/**/*.{ts,tsx}',
      'components/Landings/CreateCourseTrigger.tsx',
      'app/(platform)/(withmenu)/courses/**/*.{ts,tsx}',
    ],
  },

  /* ------------------------------------------------------------------------ */
  /* Tests                                                                    */
  /* ------------------------------------------------------------------------ */

  {
    name: 'tests',
    files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', 'tests/**/*.{ts,tsx}', 'src/tests/**/*.{ts,tsx}'],
    rules: {
      'i18next/no-literal-string': 'off',
      'react/jsx-no-literals': 'off',
      'react-compiler/react-compiler': 'off',
      'react-hooks/rules-of-hooks': 'off',
    },
  },

  /* ------------------------------------------------------------------------ */
  /* E2E Tests                                                                */
  /* ------------------------------------------------------------------------ */

  {
    name: 'e2e-tests',
    files: ['e2e/**/*.{ts,tsx}'],
    rules: {
      'i18next/no-literal-string': 'off',
      'react/jsx-no-literals': 'off',
      'react-compiler/react-compiler': 'off',
      'react-hooks/rules-of-hooks': 'off',
      'no-empty-pattern': 'off',
    },
  },

  /* ------------------------------------------------------------------------ */
  /* Node.js Scripts                                                          */
  /* ------------------------------------------------------------------------ */

  {
    name: 'node-scripts',
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
      },
    },
  },
)
