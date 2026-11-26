import { useState, type CSSProperties, type PointerEvent } from 'react'

import { m } from '#/paraglide/messages'
import { Slider, SliderControl, SliderIndicator, SliderThumb, SliderTrack } from '#/shared/ui/slider'

import { clock } from '../../model/file-blocks'

type Bar = { time: number; duration: number; buffered: number; onSeek: (time: number) => void }

type Bars = CSSProperties & Record<'--loaded' | '--hover', string>

const share = (part: number, whole: number) => `${whole > 0 ? Math.min(100, (part / whole) * 100) : 0}%`

/** Where the pointer is along the bar, 0..1. */
function along(event: PointerEvent<HTMLElement>) {
  const box = event.currentTarget.getBoundingClientRect()
  return box.width > 0 ? Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)) : 0
}

/**
 * The position bar: played (solid), loaded ahead (lighter), the time under the mouse in a bubble; arrows move a
 * second, Page Up/Down ten. Thin until hovered or focused, like a seam over the picture.
 */
export function SeekBar({ time, duration, buffered, onSeek }: Bar) {
  const [hover, setHover] = useState<number | null>(null)
  const max = duration > 0 ? duration : 1
  // The bubble stays inside the frame near either end.
  const bubble = Math.min(0.95, Math.max(0.05, hover ?? 0))
  return (
    <Slider
      value={Math.min(time, max)}
      max={max}
      step={1}
      largeStep={10}
      disabled={duration <= 0}
      format={value => m.editor_video_position_text({ current: clock(value), total: clock(duration) })}
      onValueChange={value => onSeek(value)}
      className="group/seek data-disabled:opacity-100"
      style={{ '--loaded': share(buffered, duration), '--hover': share(bubble, 1) } as Bars}
    >
      <SliderControl
        className="h-4"
        onPointerMove={event => event.pointerType === 'mouse' && setHover(along(event))}
        onPointerLeave={() => setHover(null)}
      >
        {hover !== null && duration > 0 ? (
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-full left-(--hover) mb-2 -translate-x-1/2 rounded-md bg-media px-2 py-1 text-xs text-media-foreground tabular-nums shadow-md"
          >
            {clock(hover * duration)}
          </span>
        ) : null}
        <SliderTrack className="bg-media-foreground/25 group-hover/seek:h-1.5">
          <span aria-hidden className="absolute inset-y-0 left-0 w-(--loaded) rounded-s-full bg-media-foreground/35" />
          <SliderIndicator className="rounded-e-none bg-media-foreground" />
          <SliderThumb
            aria-label={m.editor_video_position()}
            className="size-3.5 border-0 bg-media-foreground opacity-0 shadow-md transition-opacity group-hover/seek:opacity-100 has-focus-visible:opacity-100 has-focus-visible:ring-0 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring data-dragging:opacity-100"
          />
        </SliderTrack>
      </SliderControl>
    </Slider>
  )
}
