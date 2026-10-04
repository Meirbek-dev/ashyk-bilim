import { Store } from '@tanstack/react-store'

import { storageItem } from '#/shared/lib/storage'

import { draftKey, type Queue, vQueue } from '../model/queue'

/**
 * The global client state of spec 7.8: each attempt's queue of unacknowledged answers, by attempt id. Every change
 * goes to this tab's memory and to localStorage, applied to what storage holds now, so a reload, a closed tab or a
 * signed-out session starts from the same queue, and two tabs of one attempt never erase each other's entries.
 */
export const draftStore = new Store<Record<string, Queue>>({})

/** Whose attempt each loaded queue is: the storage key carries the user, so a shared browser keeps queues apart. */
const owners = new Map<string, string>()
const stored = (attemptId: string) => storageItem(draftKey(owners.get(attemptId) ?? 'anonymous', attemptId), vQueue)

/** Adopt the persisted queue the first time this tab opens the attempt (as `userId`). */
export function loadQueue(attemptId: string, userId: string): void {
  owners.set(attemptId, userId)
  if (attemptId in draftStore.state) return
  draftStore.setState(state => ({ ...state, [attemptId]: stored(attemptId).get() ?? [] }))
}

/**
 * Both copies take the same change: this tab's memory, and what storage holds now (another tab of the attempt may
 * have written it). `change` must therefore be a pure function of its queue (an id is minted by the caller).
 */
export function updateQueue(attemptId: string, change: (queue: Queue) => Queue): void {
  draftStore.setState(state => ({ ...state, [attemptId]: change(state[attemptId] ?? []) }))
  const item = stored(attemptId)
  const next = change(item.get() ?? [])
  if (next.length) item.set(next)
  else item.remove()
}

export const queueOf = (attemptId: string): Queue => draftStore.state[attemptId] ?? []

/** The attempt is handed in: nothing of it is left to send. */
export function clearQueue(attemptId: string): void {
  updateQueue(attemptId, () => [])
}
