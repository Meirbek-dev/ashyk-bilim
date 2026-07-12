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
