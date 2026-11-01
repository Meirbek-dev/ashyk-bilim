import * as v from 'valibot'

import { storageItem } from '#/shared/lib/storage'

import { rememberPosition, resumeAt, type Positions } from '../../model/video-player'

/** Volume, sound and speed carry over from one video to the next, like any player. */
const preferences = storageItem(
  'ab.video-player',
  v.object({
    volume: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
    muted: v.boolean(),
    rate: v.pipe(v.number(), v.minValue(0.25), v.maxValue(4)),
  }),
)

const positions = storageItem<Positions>(
  'ab.video-positions',
  v.record(v.string(), v.object({ time: v.number(), at: v.number() })),
)

/** Storage can be missing or full (private windows, quotas): the player then just does not remember. */
function quietly<T>(run: () => T): T | null {
  try {
    return run()
  } catch {
    return null
  }
}

export function restorePreferences(element: HTMLVideoElement) {
  const saved = quietly(() => preferences.get())
  if (!saved) return
  element.volume = saved.volume
  element.muted = saved.muted
  // A new source resets the speed to the default one: set both.
  element.defaultPlaybackRate = saved.rate
  element.playbackRate = saved.rate
}

/** Called from the user's own changes only: a reset by a new load is not a preference. */
export function savePreferences(element: HTMLVideoElement) {
  quietly(() => preferences.set({ volume: element.volume, muted: element.muted, rate: element.playbackRate }))
}

export const savedPosition = (src: string, duration: number) =>
  resumeAt(quietly(() => positions.get())?.[src]?.time, duration)

export function savePosition(src: string, time: number, duration: number) {
  quietly(() => positions.set(rememberPosition(positions.get() ?? {}, src, time, duration, Date.now())))
}
