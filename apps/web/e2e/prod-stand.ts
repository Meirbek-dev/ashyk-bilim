// e2e against the production build on this machine (AGENTS.md "e2e against the production build"): the stand's nginx
// in miniature. `/api/v2` goes to the API, buckets and `/content/<key>` to storage, the rest to `node serve.ts`.
// `node e2e/prod-stand.ts` (Node strips the types); ports: PORT (3100, the base URL), WEB_PORT (3101).
import { request as httpRequest, createServer, type IncomingMessage, type ServerResponse } from 'node:http'

const env = (name: string, fallback: string) => process.env[name] ?? fallback
const api = new URL(env('API_PROXY_TARGET', 'http://127.0.0.1:8000'))
const storage = new URL(env('STORAGE_PROXY_TARGET', 'http://localhost:9002'))
const web = new URL(`http://127.0.0.1:${env('WEB_PORT', '3101')}`)

function route(path: string): { target: URL; path: string } {
  if (path.startsWith('/api/v2')) return { target: api, path }
  if (path.startsWith('/ab-public') || path.startsWith('/ab-private')) return { target: storage, path }
  if (path.startsWith('/content/')) return { target: storage, path: path.replace(/^\/content\//, '/ab-public/') }
  return { target: web, path }
}

function forward(incoming: IncomingMessage, outgoing: ServerResponse): void {
  const { target, path } = route(incoming.url ?? '/')
  // Storage signs against its own host; the API and the web see the public host, like behind nginx.
  const host = target === storage ? target.host : incoming.headers.host
  const upstream = httpRequest(
    { host: target.hostname, port: target.port, method: incoming.method, path, headers: { ...incoming.headers, host } },
    answer => {
      outgoing.writeHead(answer.statusCode ?? 502, answer.headers)
      answer.pipe(outgoing)
    },
  )
  upstream.on('error', error => {
    if (!outgoing.headersSent) outgoing.writeHead(502)
    outgoing.end(String(error))
  })
  // A closed tab ends its event stream upstream too (the API caps open streams per user).
  outgoing.on('close', () => upstream.destroy())
  incoming.pipe(upstream)
}

createServer(forward).listen(Number(env('PORT', '3100')), '127.0.0.1')
