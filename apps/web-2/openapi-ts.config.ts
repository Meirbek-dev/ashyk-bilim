import { defineConfig } from '@hey-api/openapi-ts'

// Generates src/shared/api/gen from the server contract as is: no parser.patch,
// contract defects are fixed in apps/server (S-01, gate G-08).
// OPENAPI_OUTPUT exists only for the drift gate (G-09), which regenerates into a scratch dir.
export default defineConfig({
  input: { path: '../server/openapi.v2.json' },
  output: {
    path: process.env['OPENAPI_OUTPUT'] ?? './src/shared/api/gen',
    clean: true,
    postProcess: [],
  },
  plugins: [
    { name: '@hey-api/client-fetch', baseUrl: false, runtimeConfigPath: './src/shared/api/client.ts' },
    '@hey-api/typescript',
    { name: 'valibot', definitions: true, requests: true, responses: true },
    { name: '@hey-api/sdk', validator: { request: false, response: 'valibot' } },
    '@tanstack/react-query',
  ],
})
