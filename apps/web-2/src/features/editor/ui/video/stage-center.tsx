import { Play, RotateCcw } from 'lucide-react'

import { Spinner } from '#/shared/ui/spinner'

import type { MediaState } from './use-media-state'

/**
 * The big mark in the middle of the picture: play while paused, replay at the end, a spinner while the video waits
 * for data. Decoration over the picture (clicks go through to it); the control bar holds the named buttons.
 */
export function StageCenter({ state }: { state: MediaState }) {
  if (state.playing && !state.waiting) return null
  const mark = state.waiting ? (
    <Spinner className="size-8" />
  ) : state.ended ? (
    <RotateCcw aria-hidden className="size-8" />
  ) : (
    <Play aria-hidden className="size-8 translate-x-0.5 fill-current" />
  )
  return (
    <span className="pointer-events-none absolute grid size-16 place-items-center rounded-full bg-media/70 @md:size-20">
      {mark}
    </span>
  )
}
