// The service worker (docs/REWRITE.md 7.8), served as /sw.js: gates/bundle.ts `serviceWorker` bundles this file
// into one classic script after the client build and defines `__AB_SW__`. No dependencies, no imports of the app.
//
// - Hashed build assets (`/assets/*`, immutable): the entry's chunks and styles are precached at install; every
//   asset is served cache-first and kept on first use. A new build installs a new cache and drops the old ones.
// - Pages (SSR HTML, each with its own CSP nonce), `/api` and everything else go to the network untouched: nothing a
//   course shows is readable offline.
// - Exam autosaves (`PATCH /api/v2/submissions/{id}/draft`) refused by the network are kept in IndexedDB and replayed
//   in order once online (draft-queue.ts).
//
// Kill switch: a build whose sw.js only unregisters itself (`self.registration.unregister()` in `activate`).

import {
  draftOf,
  draftSubmission,
  pageSave,
  replay,
  serializer,
  type Advance,
  type DraftStore,
  type QueuedDraft,
} from './draft-queue'

// oxlint-disable-next-line no-underscore-dangle -- a build-time define (gates/bundle.ts), not a runtime name
declare const __AB_SW__: { version: string; precache: string[] }

/** The parts of the worker scope used here (the DOM lib the app compiles against has no WebWorker types). */
type ExtendableEvent = Event & { waitUntil(promise: Promise<unknown>): void }
type FetchEvent = ExtendableEvent & { request: Request; respondWith(response: Promise<Response>): void }
type MessageEvent = ExtendableEvent & { data: unknown }
type SyncEvent = ExtendableEvent & { tag: string }
type WorkerScope = {
  addEventListener(type: 'install' | 'activate', listener: (event: ExtendableEvent) => void): void
  addEventListener(type: 'fetch', listener: (event: FetchEvent) => void): void
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void
  addEventListener(type: 'sync', listener: (event: SyncEvent) => void): void
  skipWaiting(): Promise<void>
  clients: { claim(): Promise<void> }
  registration: { sync?: { register(tag: string): Promise<void> } }
  location: Location
}

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- this file runs only as the worker script
const worker = globalThis as unknown as WorkerScope
// oxlint-disable-next-line no-underscore-dangle -- the define above
const { version, precache } = __AB_SW__
const ASSETS = `ab-assets-${version}`
const SYNC_TAG = 'ab-draft-replay'

worker.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(ASSETS)
      .then(cache => cache.addAll(precache))
      .then(() => worker.skipWaiting()),
  )
})

worker.addEventListener('activate', event => {
  const stale = caches
    .keys()
    .then(keys =>
      Promise.all(keys.filter(key => key.startsWith('ab-assets-') && key !== ASSETS).map(key => caches.delete(key))),
    )
  event.waitUntil(stale.then(() => worker.clients.claim()).then(sendQueue))
})

worker.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)
  if (url.origin !== worker.location.origin) return
  if (request.method === 'GET' && url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request))
    return
  }
  const submissionId = draftSubmission(request.method, url.pathname)
  if (submissionId) event.respondWith(autosave(request, submissionId, url.pathname))
})

// The page asks after it loads and when it comes back online; Background Sync (Chromium) wakes the worker without one.
worker.addEventListener('message', event => {
  if (typeof event.data === 'object' && event.data !== null && 'type' in event.data && event.data.type === 'replay')
    event.waitUntil(sendQueue())
})
worker.addEventListener('sync', event => {
  if (event.tag === SYNC_TAG) event.waitUntil(sendQueue())
})

async function cacheFirst(request: Request): Promise<Response> {
  const cache = await caches.open(ASSETS)
  const cached = await cache.match(request)
  if (cached) return cached
  // oxlint-disable-next-line no-restricted-globals -- the worker forwards the page's own request; the SDK is the page's
  const response = await fetch(request)
  if (response.ok && response.type === 'basic') await cache.put(request, response.clone())
  return response
}

const lock = serializer()

async function autosave(request: Request, submissionId: string, path: string): Promise<Response> {
  const body = await request.clone().text()
  const draft = draftOf(submissionId, path, request.headers.get('if-match'), body, Date.now())
  // oxlint-disable-next-line no-restricted-globals -- not an autosave this queue understands: sent as it came
  if (!draft) return fetch(request)
  try {
    // The page's own body (with `last`, its budget past the 5 s throttle); only If-Match may change.
    return await lock(submissionId, () => pageSave(store, draft, saved => send(saved, request.headers, body)))
  } catch (error) {
    // Queued: Background Sync (where there is one) sends it even if no page of the site opens again.
    await worker.registration.sync?.register(SYNC_TAG).catch(() => undefined)
    throw error
  }
}

/** A save based on `draft.ifMatch`: the page's request (its headers and body), or a replay of the queued answers. */
function send(
  draft: QueuedDraft,
  headers = new Headers({ 'content-type': 'application/json' }),
  body = JSON.stringify({ answers: draft.answers }),
) {
  const sent = new Headers(headers)
  sent.set('if-match', String(draft.ifMatch))
  // oxlint-disable-next-line no-restricted-globals -- the worker sends the page's save (same origin, its cookie)
  return fetch(draft.path, {
    method: 'PATCH',
    headers: sent,
    body,
    credentials: 'same-origin',
  })
}

async function sendQueue(): Promise<void> {
  await replay(store, draft => send(draft), Date.now(), lock)
}

// IndexedDB: one database, two stores keyed by the attempt.
let opened: Promise<IDBDatabase> | null = null

function database(): Promise<IDBDatabase> {
  opened ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('ab-sw', 1)
    request.addEventListener('upgradeneeded', () => {
      request.result.createObjectStore('drafts', { keyPath: 'submissionId' })
      request.result.createObjectStore('advances', { keyPath: 'submissionId' })
    })
    request.addEventListener('success', () => resolve(request.result))
    request.addEventListener('error', () => reject(request.error ?? new Error('indexedDB.open failed')))
  })
  opened.catch(() => {
    opened = null
  })
  return opened
}

/**
 * One request. IndexedDB can fail (storage full, a private window): a read then finds nothing and a write is lost, but
 * the page's save still goes to the network as it would without a worker.
 */
function call<T>(
  name: 'drafts' | 'advances',
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest,
  fallback: T,
): Promise<T> {
  const done = database().then(
    db =>
      new Promise<T>((resolve, reject) => {
        const request = run(db.transaction(name, mode).objectStore(name))
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the stores hold only what this file puts
        request.addEventListener('success', () => resolve(request.result as T))
        request.addEventListener('error', () => reject(request.error ?? new Error(`${name} request failed`)))
      }),
  )
  return done.catch(() => fallback)
}

const store: DraftStore = {
  drafts: () => call<QueuedDraft[]>('drafts', 'readonly', s => s.getAll(), []),
  draft: id => call<QueuedDraft | undefined>('drafts', 'readonly', s => s.get(id), undefined),
  putDraft: draft => call<void>('drafts', 'readwrite', s => s.put(draft), undefined),
  deleteDraft: id => call<void>('drafts', 'readwrite', s => s.delete(id), undefined),
  advance: id => call<Advance | undefined>('advances', 'readonly', s => s.get(id), undefined),
  putAdvance: advance => call<void>('advances', 'readwrite', s => s.put(advance), undefined),
  deleteAdvance: id => call<void>('advances', 'readwrite', s => s.delete(id), undefined),
}
