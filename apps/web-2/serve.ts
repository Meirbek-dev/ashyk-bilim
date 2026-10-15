// Production entry (`node serve.ts`, Node strips the types): srvx serves the built client assets and
// hands everything else to the Start fetch handler in dist/server/server.js (src/server.ts).
import { fileURLToPath } from 'node:url'

import { serve } from 'srvx'
import { staticMiddleware } from 'srvx/static'

const clientDir = fileURLToPath(new URL('./dist/client/', import.meta.url))
const serverEntry = new URL('./dist/server/server.js', import.meta.url).href
const app: unknown = (await import(serverEntry)).default
if (typeof app !== 'object' || app === null || !('fetch' in app) || typeof app.fetch !== 'function') {
  throw new TypeError(`${serverEntry} does not export a fetch handler`)
}

// Hashed build output never changes under its name; everything else revalidates (stage 1 contract).
const hashed = staticMiddleware({ dir: clientDir, maxAge: 31_536_000, immutable: true })
const unhashed = staticMiddleware({ dir: clientDir })

serve({
  port: Number(process.env['PORT'] ?? 3000),
  hostname: process.env['HOST'] ?? '0.0.0.0',
  // SIGTERM/SIGINT: stop accepting, let in-flight requests finish, then exit.
  gracefulShutdown: true,
  middleware: [
    async (request, next) => {
      if (!new URL(request.url).pathname.startsWith('/assets/')) {
        const response = await unhashed(request, next)
        // Unhashed files (themes, favicon) revalidate by ETag: without a directive browsers cache them by heuristic
        // for days after a deploy. Documents set their own (src/server.ts).
        if (!response.headers.has('cache-control')) response.headers.set('cache-control', 'no-cache')
        return response
      }
      const response = await hashed(request, next)
      // srvx omits `public`; the stage 1 web contract (and nginx's cache) expect the full directive.
      if (response.headers.get('cache-control')?.includes('immutable')) {
        response.headers.set('cache-control', 'public, max-age=31536000, immutable')
      }
      return response
    },
  ],
  fetch: app.fetch.bind(app),
})
