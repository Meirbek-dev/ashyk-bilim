import { describe, expect, test } from 'vite-plus/test'

import {
  draftOf,
  draftSubmission,
  MAX_AGE_MS,
  merge,
  pageSave,
  replay,
  serializer,
  verdict,
  type Advance,
  type DraftStore,
  type QueuedDraft,
} from './draft-queue'

const A = '0190a5d2-0000-7000-8000-00000000000a'
const B = '0190a5d2-0000-7000-8000-00000000000b'
const path = (id: string) => `/api/v2/submissions/${id}/draft`

function memoryStore() {
  const drafts = new Map<string, QueuedDraft>()
  const advances = new Map<string, Advance>()
  const store: DraftStore = {
    drafts: async () => [...drafts.values()],
    draft: async id => drafts.get(id),
    putDraft: async draft => void drafts.set(draft.submissionId, draft),
    deleteDraft: async id => void drafts.delete(id),
    advance: async id => advances.get(id),
    putAdvance: async advance => void advances.set(advance.submissionId, advance),
    deleteAdvance: async id => void advances.delete(id),
  }
  return { store, drafts, advances }
}

const queued = (id: string, ifMatch: number, answers: Record<string, unknown>, queuedAt = 1000): QueuedDraft => ({
  submissionId: id,
  path: path(id),
  ifMatch,
  answers,
  queuedAt,
})

/** A fake server: records each save (attempt, If-Match, answers) and answers with the next status. */
function server(statuses: (number | 'offline')[]) {
  const sent: { id: string; ifMatch: number; answers: Record<string, unknown> }[] = []
  const send = async (draft: QueuedDraft) => {
    const status = statuses[sent.length] ?? 200
    sent.push({ id: draft.submissionId, ifMatch: draft.ifMatch, answers: draft.answers })
    if (status === 'offline') throw new TypeError('Failed to fetch')
    const body = status === 200 ? { id: draft.submissionId, draft_version: draft.ifMatch + 1 } : { code: 'x' }
    return Response.json(body, { status })
  }
  return { send, sent }
}

describe('reading the page request', () => {
  test('only PATCH /api/v2/submissions/{id}/draft is an autosave', () => {
    expect(draftSubmission('PATCH', path(A))).toBe(A)
    expect(draftSubmission('POST', path(A))).toBeNull()
    expect(draftSubmission('PATCH', `/api/v2/submissions/${A}/submit`)).toBeNull()
    expect(draftSubmission('PATCH', `/api/v2/file-submissions/${A}/draft`)).toBeNull()
  })

  test('If-Match plain or quoted; a body without answers or a missing version passes untouched', () => {
    const body = JSON.stringify({ answers: { q1: { kind: 'text', text: 'Әл' } }, last: true })
    expect(draftOf(A, path(A), '7', body, 5)).toEqual(queued(A, 7, { q1: { kind: 'text', text: 'Әл' } }, 5))
    expect(draftOf(A, path(A), '"7"', body, 5)?.ifMatch).toBe(7)
    expect(draftOf(A, path(A), null, body, 5)).toBeNull()
    expect(draftOf(A, path(A), 'W/x', body, 5)).toBeNull()
    expect(draftOf(A, path(A), '7', '{"answers":[]}', 5)).toBeNull()
    expect(draftOf(A, path(A), '7', 'not json', 5)).toBeNull()
  })
})

describe('queueing a refused save', () => {
  test('a later save merges over the earlier one item by item and keeps its place in the queue', () => {
    const earlier = queued(A, 3, { q1: 'a', q2: 'b' }, 100)
    expect(merge(earlier, queued(A, 3, { q2: 'B', q3: 'c' }, 200))).toEqual(
      queued(A, 3, { q1: 'a', q2: 'B', q3: 'c' }, 100),
    )
  })

  test('offline: the page save is queued and still fails for the page; online it clears the queue', async () => {
    const { store, drafts } = memoryStore()
    const offline = server(['offline', 'offline'])
    await expect(pageSave(store, queued(A, 3, { q1: 'a' }, 100), offline.send)).rejects.toThrow('Failed to fetch')
    await expect(pageSave(store, queued(A, 3, { q2: 'b' }, 200), offline.send)).rejects.toThrow('Failed to fetch')
    expect(drafts.get(A)).toEqual(queued(A, 3, { q1: 'a', q2: 'b' }, 100))
    const online = server([200])
    const response = await pageSave(store, queued(A, 3, { q1: 'a', q2: 'b' }, 300), online.send)
    expect(response.status).toBe(200)
    expect(drafts.size).toBe(0)
  })

  test('a refusal the server gave (409, 429) goes back to the page as it is and queues nothing', async () => {
    const { store, drafts } = memoryStore()
    const response = await pageSave(store, queued(A, 3, { q1: 'a' }), server([409]).send)
    expect(response.status).toBe(409)
    expect(drafts.size).toBe(0)
  })
})

describe('replay', () => {
  test('oldest first; each attempt once with its merged answers; saved entries leave the queue', async () => {
    const { store, drafts } = memoryStore()
    await store.putDraft(queued(B, 9, { q1: 'b' }, 200))
    await store.putDraft(queued(A, 3, { q1: 'a', q2: 'c' }, 100))
    const { send, sent } = server([])
    expect(await replay(store, send, 1000)).toEqual([A, B])
    expect(sent).toEqual([
      { id: A, ifMatch: 3, answers: { q1: 'a', q2: 'c' } },
      { id: B, ifMatch: 9, answers: { q1: 'b' } },
    ])
    expect(drafts.size).toBe(0)
  })

  test("after a replay the page's save based on the old version is sent on the new one", async () => {
    const { store, advances } = memoryStore()
    await store.putDraft(queued(A, 3, { q1: 'a' }))
    await replay(store, server([]).send, 1000)
    expect(advances.get(A)).toEqual({ submissionId: A, from: [3], to: 4 })
    const page = server([])
    await pageSave(store, queued(A, 3, { q1: 'a', q2: 'b' }), page.send)
    expect(page.sent[0]?.ifMatch).toBe(4)
    // The page now holds the server's version: nothing is rewritten any more.
    expect(advances.size).toBe(0)
  })

  test('another version (a save from another device) is sent as it is: the page gets its conflict', async () => {
    const { store } = memoryStore()
    await store.putAdvance({ submissionId: A, from: [3], to: 4 })
    const page = server([409])
    expect((await pageSave(store, queued(A, 6, { q1: 'x' }), page.send)).status).toBe(409)
    expect(page.sent[0]?.ifMatch).toBe(6)
  })
})

describe('replay refusals', () => {
  test('offline, 5xx or signed out stops the replay and keeps the queue; 429 skips that attempt only', async () => {
    const { store, drafts } = memoryStore()
    await store.putDraft(queued(A, 3, { q1: 'a' }, 100))
    await store.putDraft(queued(B, 9, { q1: 'b' }, 200))
    expect(await replay(store, server(['offline']).send, 1000)).toEqual([])
    expect(await replay(store, server([502]).send, 1000)).toEqual([])
    expect(await replay(store, server([401]).send, 1000)).toEqual([])
    expect(drafts.size).toBe(2)
    const throttled = server([429, 200])
    expect(await replay(store, throttled.send, 1000)).toEqual([B])
    expect([...drafts.keys()]).toEqual([A])
  })

  test('a final refusal (409 stale, 403 gate closed) drops the entry: the page resolves it from its own queue', async () => {
    const { store, drafts, advances } = memoryStore()
    await store.putDraft(queued(A, 3, { q1: 'a' }, 100))
    await store.putDraft(queued(B, 9, { q1: 'b' }, 200))
    expect(await replay(store, server([409, 403]).send, 1000)).toEqual([])
    expect(drafts.size).toBe(0)
    expect(advances.size).toBe(0)
  })

  test('answers queued more than a week ago are dropped unsent', async () => {
    const { store, drafts } = memoryStore()
    await store.putDraft(queued(A, 3, { q1: 'a' }, 0))
    const { send, sent } = server([])
    expect(await replay(store, send, MAX_AGE_MS + 1)).toEqual([])
    expect(sent).toEqual([])
    expect(drafts.size).toBe(0)
  })

  test('a replay waits for the page save of the same attempt in flight, then finds nothing left to send', async () => {
    const { store } = memoryStore()
    await store.putDraft(queued(A, 3, { q1: 'a' }))
    const lock = serializer()
    const { promise: gate, resolve: release } = Promise.withResolvers<void>()
    const { send, sent } = server([])
    const page = lock(A, async () => {
      await gate
      return pageSave(store, queued(A, 3, { q1: 'a', q2: 'b' }), send)
    })
    const replayed = replay(store, send, 1000, lock)
    release()
    await page
    expect(await replayed).toEqual([])
    expect(sent).toHaveLength(1)
  })
})

test('verdicts: 2xx saved, 429 later, offline/401/408/5xx stop, other refusals dropped', () => {
  expect([200, 204].map(verdict)).toEqual(['saved', 'saved'])
  expect(verdict(429)).toBe('later')
  expect([null, 401, 408, 500, 503].map(verdict)).toEqual(['stop', 'stop', 'stop', 'stop', 'stop'])
  expect([403, 404, 409, 412, 422].map(verdict)).toEqual(['dropped', 'dropped', 'dropped', 'dropped', 'dropped'])
})
