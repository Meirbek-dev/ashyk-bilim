import { defineConfig } from 'orval'

// check:contracts regenerates into a scratch sibling directory (same depth, same relative imports).
const outDir = process.env.ORVAL_OUTPUT_DIR ?? 'src/lib/api/generated'

/**
 * Client generation for the v2 contract (`apps/server/openapi.v2.json`,
 * produced by `ashyq openapi`). Run `bun run generate:api-types` after the
 * contract changes; the output under `src/lib/api/generated` is committed.
 */
export default defineConfig({
  api: {
    input: {
      target: '../server/openapi.v2.json',
      override: {
        transformer: 'scripts/orval-input-transformer.mjs',
      },
    },
    output: {
      target: `${outDir}/api.ts`,
      mode: 'tags-split',
      // Removes files of operations/schemas the contract no longer has.
      clean: true,
      client: 'react-query',
      httpClient: 'fetch',
      schemas: {
        type: 'zod',
        path: `${outDir}/zod`,
      },
      tagsSplitDeduplication: true,
      override: {
        fetch: {
          includeHttpResponseReturnType: false,
        },
        mutator: {
          path: 'src/lib/api/orval-mutator.ts',
          name: 'orvalMutator',
        },
        query: {
          useSuspenseQuery: true,
          signal: true,
        },
        zod: {
          generate: {
            response: true,
          },
          strict: {
            response: true,
          },
        },
      },
    },
  },
})
