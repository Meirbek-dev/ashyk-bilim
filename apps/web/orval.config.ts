import { defineConfig } from 'orval'

export default defineConfig({
  api: {
    input: {
      target: '../api/openapi.json',
    },
    output: {
      target: 'src/lib/api/generated/api.ts',
      mode: 'tags-split',
      client: 'react-query',
      httpClient: 'fetch',
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
      },
    },
    hooks: {
      afterAllFilesWrite: ['node scripts/postprocess-orval-output.mjs', 'vp fmt --write'],
    },
  },
})
