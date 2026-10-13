// The web-2 `fmt` block, shared with the repo-root vite.config.ts so a file formats the same from any cwd.
// Paths are relative to apps/web-2 (the root config prefixes them).
export const fmt = {
  printWidth: 120,
  semi: false,
  singleQuote: true,
  trailingComma: 'all' as const,
  arrowParens: 'avoid' as const,
  endOfLine: 'lf' as const,
  sortPackageJson: false,
  sortTailwindcss: { stylesheet: 'src/styles/globals.css' },
  ignorePatterns: [
    'src/shared/api/gen*/',
    'src/paraglide/',
    'src/routeTree.*.ts',
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
}
