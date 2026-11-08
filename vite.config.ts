// Formatting for the whole repo: a file formats the same from any cwd (`vp fmt` uses the nearest config with a `fmt`
// block). apps/web-2 is its own workspace, so its block lives in apps/web-2/fmt.config.ts and is applied here as an
// override. Formats the web app, infra/dev and this file.
import { fmt as web2 } from './apps/web-2/fmt.config.ts'

const { ignorePatterns: web2Ignored, sortTailwindcss: web2Tailwind, ...web2Options } = web2

export default {
  fmt: {
    printWidth: 120,
    semi: false,
    singleQuote: true,
    trailingComma: 'all',
    arrowParens: 'avoid',
    endOfLine: 'lf',
    sortPackageJson: true,
    sortTailwindcss: true,
    ignorePatterns: [
      // Everything outside the web app.
      '.agents/',
      '.claude/',
      '.codex/',
      '.github/',
      'apps/server/',
      'docs/',
      // infra/dev (bun scripts) is formatted; the rest of infra is not.
      'infra/*.yaml',
      'infra/env/',
      'infra/runner/',
      'infra/nginx/',
      'infra/postgres/',
      'infra/scripts/',
      'infra/smoke/',
      'infra/storage/',
      'infra/tests/',
      'temp-restore/',
      'tmp/',
      '/*.md',
      '/*.yaml',
      '**/node_modules/',
      ...web2Ignored.map(pattern => `apps/web-2/${pattern}`),
    ],
    overrides: [
      {
        files: ['apps/web-2/**'],
        options: { ...web2Options, sortTailwindcss: { stylesheet: `apps/web-2/${web2Tailwind.stylesheet}` } },
      },
    ],
  },
}
