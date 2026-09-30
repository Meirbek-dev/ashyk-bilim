import { defineConfig } from 'orval'

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
      target: 'src/lib/api/generated/api.ts',
      mode: 'tags-split',
      client: 'react-query',
      httpClient: 'fetch',
      schemas: {
        type: 'zod',
        path: 'src/lib/api/generated/zod',
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
