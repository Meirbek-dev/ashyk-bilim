// eslint.config.mjs
// @ts-check
import i18next from 'eslint-plugin-i18next';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import js from '@eslint/js';

// Plugins
import unusedImports from 'eslint-plugin-unused-imports';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import next from '@next/eslint-plugin-next';
import react from 'eslint-plugin-react';
import pluginQuery from '@tanstack/eslint-plugin-query';
import reactCompiler from 'eslint-plugin-react-compiler';

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
  'i18next/no-literal-string': [
    'warn',
    {
      markupOnly: true,
      ignore: ['/', '%', '(', ')', '@', '#', ':', '+', ',', '…', '✓', '•', '🛠️', '🏆'],
      onlyAttribute: [''], // This prevents it from checking every single prop
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
  'no-var': 'error',
  'prefer-const': 'warn',
  'eqeqeq': ['error', 'always', { null: 'always' }],
  'no-unused-expressions': ['warn', { allowShortCircuit: true, allowTernary: true }],
  'no-empty': ['warn', { allowEmptyCatch: false }],
  'no-redeclare': 'warn',
  'no-unused-vars': 'off',
};

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

      /* Disable core rules replaced by TS */

      'no-undef': 'off',
      'no-redeclare': 'off',

      '@typescript-eslint/no-redeclare': 'warn',

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
);
