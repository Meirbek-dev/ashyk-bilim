import { Slider } from '@base-ui/react/slider'
import { useId, useState, type CSSProperties, type PointerEvent } from 'react'

import { m } from '#/paraglide/messages'

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
  const label = useId()
  const [hover, setHover] = useState<number | null>(null)
  const max = duration > 0 ? duration : 1
  // The bubble stays inside the frame near either end.
  const bubble = Math.min(0.95, Math.max(0.05, hover ?? 0))
  return (
    <Slider.Root
      aria-labelledby={label}
      value={Math.min(time, max)}
      max={max}
      step={1}
      largeStep={10}
      disabled={duration <= 0}
      thumbAlignment="center"
      onValueChange={value => onSeek(value)}
      className="group/seek"
      style={{ '--loaded': share(buffered, duration), '--hover': share(bubble, 1) } as Bars}
    >
      <span id={label} className="sr-only">
        {m.editor_video_position()}
      </span>
      <Slider.Control
        className="relative flex h-4 w-full cursor-pointer touch-none items-center select-none"
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
        <Slider.Track className="relative h-1 w-full overflow-hidden rounded-full bg-media-foreground/25 group-hover/seek:h-1.5">
          <span aria-hidden className="absolute inset-y-0 left-0 w-(--loaded) bg-media-foreground/35" />
          <Slider.Indicator className="h-full bg-media-foreground" />
        </Slider.Track>
        <Slider.Thumb
          getAriaValueText={(_, value) =>
            m.editor_video_position_text({ current: clock(value), total: clock(duration) })
          }
          className="size-3.5 rounded-full bg-media-foreground opacity-0 shadow-md transition-opacity group-hover/seek:opacity-100 has-focus-visible:opacity-100 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring data-dragging:opacity-100"
        />
      </Slider.Control>
    </Slider.Root>
  )
}
