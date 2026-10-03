import * as fc from 'fast-check'
import * as v from 'valibot'
import { describe, expect, test } from 'vite-plus/test'

import type { ItemAnswer } from '#/shared/api/gen/types.gen'

import { ack, enqueue, overlay, patchOf, type Queue, vQueue } from './queue'

const ITEMS = ['a', 'b', 'c', 'd']
const text = (value: string): ItemAnswer => ({ kind: 'open_text', text: value })

// A model of the whole loop: the learner answers, the client sends the queue under If-Match, replies arrive, fail,
// get lost after the server applied them, land late, are acknowledged twice, and the tab reloads from storage.
type Op =
  | { op: 'edit'; item: string; value: string }
  | { op: 'send' }
  | { op: 'reply' }
  | { op: 'fail' }
  | { op: 'lost' }
  | { op: 'late' }
  | { op: 'reack' }
  | { op: 'reload' }

const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc.record({ op: fc.constant('edit' as const), item: fc.constantFrom(...ITEMS), value: fc.string({ maxLength: 3 }) }),
  ...(['send', 'reply', 'fail', 'lost', 'late', 'reack', 'reload'] as const).map(op => fc.constant({ op })),
)

type Request = { ids: string[]; patch: Record<string, ItemAnswer>; version: number }

function simulate(ops: Op[]) {
  const server = { answers: {} as Record<string, ItemAnswer>, version: 0 }
  let local: Queue = []
  let inflight: Request | null = null
  let stray: Request | null = null
  let acked: string[] = []
  let next = 0
  const given: Record<string, ItemAnswer> = {}
  // The server's compare-and-set: a stale version is a 409 and changes nothing.
  const apply = (request: Request) => {
    if (request.version !== server.version) return false
    server.answers = { ...server.answers, ...request.patch }
    server.version += 1
    return true
  }
  const check = () => {
    const view = overlay(server.answers, local)
    for (const [item, answer] of Object.entries(given)) expect(view[item]).toEqual(answer)
    expect(new Set(local.map(entry => entry.item)).size).toBe(local.length)
  }
  for (const step of ops) {
    if (step.op === 'edit') {
      next += 1
      local = enqueue(local, { id: `e${next}`, item: step.item, answer: text(step.value) })
      given[step.item] = text(step.value)
    } else if (step.op === 'send' && !inflight && local.length) {
      inflight = { ids: local.map(entry => entry.id), patch: patchOf(local), version: server.version }
    } else if (step.op === 'reply' && inflight) {
      if (apply(inflight)) {
        local = ack(local, inflight.ids)
        acked = inflight.ids
      }
      inflight = null
    } else if (step.op === 'fail' && inflight) {
      stray = inflight // the request may still reach the server later
      inflight = null
    } else if (step.op === 'lost' && inflight) {
      apply(inflight) // applied, but the reply never came: nothing is acknowledged
      inflight = null
    } else if (step.op === 'late' && stray) {
      apply(stray)
      stray = null
    } else if (step.op === 'reack') {
      local = ack(local, acked)
    } else if (step.op === 'reload') {
      local = v.parse(vQueue, JSON.parse(JSON.stringify(local)))
      inflight = null
    }
    check()
  }
  return { server, local, given, inflight, apply }
}

describe('attempt queue', () => {
  test('B-ATT-08 a newer answer replaces the queued one and goes last; a patch carries one answer per question', () => {
    let queue: Queue = []
    queue = enqueue(queue, { id: '1', item: 'a', answer: text('x') })
    queue = enqueue(queue, { id: '2', item: 'b', answer: text('y') })
    queue = enqueue(queue, { id: '3', item: 'a', answer: text('z') })
    expect(queue.map(entry => entry.id)).toEqual(['2', '3'])
    expect(patchOf(queue)).toEqual({ b: text('y'), a: text('z') })
  })

  test('B-ATT-08 an acknowledgement removes only what was sent and is idempotent', () => {
    const sent = enqueue([], { id: '1', item: 'a', answer: text('x') })
    const later = enqueue(sent, { id: '2', item: 'a', answer: text('newer') })
    expect(ack(later, ['1'])).toEqual(later)
    expect(ack(ack(later, ['2']), ['2'])).toEqual([])
  })

  test('B-ATT-08 B-ATT-10 B-ATT-11 B-ATT-12 nothing is lost under interleaved saves, failures, late and lost replies, reloads', () => {
    fc.assert(
      fc.property(fc.array(opArb, { maxLength: 60 }), ops => {
        const { server, local, given, apply } = simulate(ops)
        // Drain: the client keeps sending what is queued at the server's current version until it is empty.
        let queue = local
        while (queue.length) {
          expect(apply({ ids: [], patch: patchOf(queue), version: server.version })).toBe(true)
          queue = ack(
            queue,
            queue.map(entry => entry.id),
          )
        }
        for (const [item, answer] of Object.entries(given)) expect(server.answers[item]).toEqual(answer)
      }),
      { numRuns: 500 },
    )
  })

  test('B-ATT-10 the persisted queue reads back the same', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.constantFrom(...ITEMS), fc.string()), { maxLength: 10 }), edits => {
        const queue = edits.reduce<Queue>(
          (list, [item, value], index) => enqueue(list, { id: String(index), item, answer: text(value) }),
          [],
        )
        expect(v.parse(vQueue, JSON.parse(JSON.stringify(queue)))).toEqual(queue)
      }),
    )
  })
})
