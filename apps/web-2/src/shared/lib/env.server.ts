import * as v from 'valibot'

// The web's whole runtime configuration (R-04). Parsed once at startup; a bad value stops the process.
const Env = v.object({
  PUBLIC_ORIGIN: v.pipe(v.string(), v.url()),
  INTERNAL_API_URL: v.pipe(v.string(), v.url()),
})

const devDefault = (value: string): string | undefined => (import.meta.env.DEV ? value : undefined)

const env = v.parse(Env, {
  PUBLIC_ORIGIN: process.env['PUBLIC_ORIGIN'] ?? devDefault('http://localhost:3000'),
  INTERNAL_API_URL: process.env['INTERNAL_API_URL'] ?? devDefault('http://127.0.0.1:8000'),
})

export const serverEnv = {
  publicOrigin: new URL(env.PUBLIC_ORIGIN).origin,
  // The SDK paths already carry /api/v2, so only the origin of INTERNAL_API_URL is used.
  apiOrigin: new URL(env.INTERNAL_API_URL).origin,
}
