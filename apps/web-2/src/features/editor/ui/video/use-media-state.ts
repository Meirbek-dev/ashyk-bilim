import { useSyncExternalStore } from 'react'

import { bufferedEnd } from '../../model/video-player'

/** What the controls show, read from the `<video>` element on each of its events. */
export type MediaState = {
  playing: boolean
  /** Playing, but stalled for data (or seeking): the stage shows a spinner. */
  waiting: boolean
  ended: boolean
  time: number
  duration: number
  /** Loaded ahead of the playhead, seconds. */
  buffered: number
  volume: number
  muted: boolean
  rate: number
  failed: boolean
}

const INITIAL: MediaState = {
  playing: false,
  waiting: false,
  ended: false,
  time: 0,
  duration: 0,
  buffered: 0,
  volume: 1,
  muted: false,
  rate: 1,
  failed: false,
}

const read = (element: HTMLVideoElement): MediaState => ({
  playing: !element.paused,
  waiting: !element.paused && (element.seeking || element.readyState < HTMLMediaElement.HAVE_FUTURE_DATA),
  ended: element.ended,
  time: element.currentTime,
  duration: Number.isFinite(element.duration) ? element.duration : 0,
  buffered: bufferedEnd(element.buffered, element.currentTime),
  volume: element.volume,
  muted: element.muted,
  rate: element.playbackRate,
  failed: element.error !== null,
})

const EVENTS = [
  'loadedmetadata',
  'durationchange',
  'emptied',
  'play',
  'pause',
  'playing',
  'waiting',
  'canplay',
  'seeking',
  'seeked',
  'timeupdate',
  'progress',
  'volumechange',
  'ratechange',
  'ended',
  'error',
] as const

/** The latest state of each element, replaced on each of its media events. */
const snapshots = new WeakMap<HTMLVideoElement, MediaState>()

/** The `<video>` element's state, kept current by its own events; nothing before mount (server render). */
export function useMediaState(element: HTMLVideoElement | null) {
  const subscribe = (notify: () => void) => {
    if (!element) return () => undefined
    const update = () => {
      snapshots.set(element, read(element))
      notify()
    }
    // Metadata or an error can arrive before the player hydrates: the first read happens on subscribe.
    update()
    for (const type of EVENTS) element.addEventListener(type, update)
    return () => {
      for (const type of EVENTS) element.removeEventListener(type, update)
    }
  }
  const snapshot = () => (element ? (snapshots.get(element) ?? INITIAL) : INITIAL)
  return useSyncExternalStore(subscribe, snapshot, () => INITIAL)
}
