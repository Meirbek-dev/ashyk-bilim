// The service worker's exam-autosave queue (docs/REWRITE.md 7.8), pure so tests run it on an in-memory store; sw.ts
// gives it IndexedDB and the network.
//
// The page stays the owner of an attempt's answers: its own queue (features/attempt, localStorage) keeps every
// unacknowledged answer, retries, and resolves conflicts. This queue only carries a save the network refused (offline)
// to the server when no page is there to send it: the tab was closed, or the learner opened another page. A save that
// reaches the server answers the page as it always did; a refused one still fails for the page (it keeps its queue).
//
// `PATCH /submissions/{id}/draft` merges answers into the draft under `If-Match: draft_version` (409 when stale, 429
// within 5 s of the last save). So one entry per attempt: a later refused save merges its answers over the earlier
// ones (the server would merge them the same way, in that order). A replay that saved moved the draft from version N
// to V: the page still holds N, and its next save (all its unacknowledged answers, a superset of what the replay
// carried) is based on V, so the worker sends it with `If-Match: V`. Any other version reaches the server as sent: a
// save from another device still ends in the page's conflict dialog.

/** One attempt's answers that did not reach the server yet. */
export type QueuedDraft = {
  submissionId: string
  /** The same-origin path the page saved to. */
  path: string
  /** The `draft_version` the answers are based on. */
  ifMatch: number
  answers: Record<string, unknown>
  /** When the first of these answers was queued: replays go oldest first. */
  queuedAt: number
}

/** The versions replays moved an attempt's draft past, all superseded by `to`. */
export type Advance = { submissionId: string; from: number[]; to: number }

/** Where the worker keeps both (IndexedDB in sw.ts). */
export type DraftStore = {
  drafts(): Promise<QueuedDraft[]>
  draft(submissionId: string): Promise<QueuedDraft | undefined>
  putDraft(draft: QueuedDraft): Promise<void>
  deleteDraft(submissionId: string): Promise<void>
  advance(submissionId: string): Promise<Advance | undefined>
  putAdvance(advance: Advance): Promise<void>
  deleteAdvance(submissionId: string): Promise<void>
}

/** Sends one save; rejects when the network refused it (offline). */
export type Send = (draft: QueuedDraft) => Promise<Response>

/** Answers older than this are dropped unsent: the attempt is long over, and the page's own queue still holds them. */
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

const DRAFT_PATH = /^\/api\/v2\/submissions\/([^/]+)\/draft$/

/** The attempt of an autosave request (`PATCH /api/v2/submissions/{id}/draft`), else null. */
export function draftSubmission(method: string, pathname: string): string | null {
  return method === 'PATCH' ? (DRAFT_PATH.exec(pathname)?.[1] ?? null) : null
}

/** The page's save as a queue entry; null when it is not one this queue understands (it then passes untouched). */
export function draftOf(
  submissionId: string,
  path: string,
  ifMatch: string | null,
  body: string,
  now: number,
): QueuedDraft | null {
  const version = Number(ifMatch?.replaceAll('"', '').trim() || Number.NaN)
  if (!Number.isSafeInteger(version)) return null
  const answers = parseAnswers(body)
  return answers ? { submissionId, path, ifMatch: version, answers, queuedAt: now } : null
}

function parseAnswers(body: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(body)
    if (typeof parsed !== 'object' || parsed === null || !('answers' in parsed)) return null
    const { answers } = parsed
    return typeof answers === 'object' && answers !== null && !Array.isArray(answers) ? { ...answers } : null
  } catch {
    return null
  }
}

/** A later refused save over an earlier one: its answers win item by item; the oldest time keeps its place. */
export function merge(earlier: QueuedDraft | undefined, later: QueuedDraft): QueuedDraft {
  if (!earlier) return later
  return { ...later, answers: { ...earlier.answers, ...later.answers }, queuedAt: earlier.queuedAt }
}

/** The version a save based on `ifMatch` is really based on, once replays moved the draft past it. */
const basedOn = (ifMatch: number, advance: Advance | undefined): number =>
  advance?.from.includes(ifMatch) ? advance.to : ifMatch

/** A replay based on `from` saved the draft as `to`. */
function advanced(advance: Advance | undefined, submissionId: string, from: number, to: number): Advance {
  const earlier = advance?.from ?? []
  return { submissionId, from: [...earlier.filter(version => version !== from), from], to }
}

/** The answer's `draft_version`, null when it has none. */
async function savedVersion(response: Response): Promise<number | null> {
  const body: unknown = await response
    .clone()
    .json()
    .catch(() => null)
  if (typeof body !== 'object' || body === null || !('draft_version' in body)) return null
  return typeof body.draft_version === 'number' ? body.draft_version : null
}

/**
 * What a replayed save's answer means for its entry. `saved`; `dropped`: the server refused it for good (409 stale or
 * handed in, 403 gate closed, 404, 422): the page resolves that from its own queue; `later`: this attempt waits (429);
 * `stop`: nothing else goes now (offline, the server or the proxy is down, 401 signed out).
 */
export function verdict(status: number | null): 'saved' | 'dropped' | 'later' | 'stop' {
  if (status === null || status === 401 || status === 408 || status >= 500) return 'stop'
  if (status === 429) return 'later'
  return status >= 200 && status < 300 ? 'saved' : 'dropped'
}

/** One request per attempt at a time: a replay and the page's own save never race on the same draft version. */
export function serializer() {
  const tails = new Map<string, Promise<unknown>>()
  return <T>(key: string, task: () => Promise<T>): Promise<T> => {
    const run = (tails.get(key) ?? Promise.resolve()).then(task, task)
    const tail = run.catch(() => undefined)
    tails.set(key, tail)
    void tail.finally(() => {
      if (tails.get(key) === tail) tails.delete(key)
    })
    return run
  }
}

/**
 * The page's own save, through the worker: based on the version replays moved its draft to; a refused one (offline) is
 * queued and still rejects, so the page keeps its queue and shows that it is offline. A save that reached the server
 * makes the queued entry redundant (the page sends all its unacknowledged answers) and tells the page the version.
 */
export async function pageSave(store: DraftStore, draft: QueuedDraft, send: Send): Promise<Response> {
  const based = { ...draft, ifMatch: basedOn(draft.ifMatch, await store.advance(draft.submissionId)) }
  let response: Response
  try {
    response = await send(based)
  } catch (error) {
    await store.putDraft(merge(await store.draft(draft.submissionId), based))
    throw error
  }
  if (response.ok) {
    await store.deleteDraft(draft.submissionId)
    await store.deleteAdvance(draft.submissionId)
  }
  return response
}

type Lock = <T>(key: string, task: () => Promise<T>) => Promise<T>

/** One queued attempt, read again under its lock (the page may have saved it meanwhile). */
async function replayOne(store: DraftStore, send: Send, submissionId: string, now: number) {
  const queued = await store.draft(submissionId)
  if (!queued) return 'dropped'
  if (now - queued.queuedAt > MAX_AGE_MS) {
    await store.deleteDraft(submissionId)
    return 'dropped'
  }
  const advance = await store.advance(submissionId)
  const draft = { ...queued, ifMatch: basedOn(queued.ifMatch, advance) }
  const response = await send(draft).catch(() => null)
  const outcome = verdict(response?.status ?? null)
  if (outcome === 'stop' || outcome === 'later') return outcome
  await store.deleteDraft(submissionId)
  const version = outcome === 'saved' && response ? await savedVersion(response) : null
  if (version !== null) await store.putAdvance(advanced(advance, submissionId, draft.ifMatch, version))
  return outcome
}

/** Sends the queue, oldest first, each attempt under `lock`. Resolves with the attempts whose answers were saved. */
export async function replay(store: DraftStore, send: Send, now: number, lock: Lock = (_key, task) => task()) {
  const saved: string[] = []
  const drafts = (await store.drafts()).toSorted((a, b) => a.queuedAt - b.queuedAt)
  for (const { submissionId } of drafts) {
    const outcome = await lock(submissionId, () => replayOne(store, send, submissionId, now))
    if (outcome === 'stop') break
    if (outcome === 'saved') saved.push(submissionId)
  }
  return saved
}
