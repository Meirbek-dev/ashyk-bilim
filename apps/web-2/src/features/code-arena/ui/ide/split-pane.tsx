import { Slider } from '@base-ui/react/slider'
import { useId, useState, type CSSProperties, type ReactNode } from 'react'

import { m } from '#/paraglide/messages'

import { clampSplit, SPLIT_STEP } from '../../model/ide'

type SplitPaneProps = {
  top: ReactNode
  bottom: ReactNode
  /** The top pane's share of the height (0.3-0.85). */
  share: number
  /** The new share once a drag ends or a key moved the divider. */
  onShare: (share: number) => void
  label: string
}

type Shares = CSSProperties & Record<'--top', string>

const percent = (share: number) => Math.round(share * 100)
/** A vertical slider counts up from the bottom: its value is the console's share. */
const fromValue = (value: number) => clampSplit(1 - value / 100)

/**
 * The editor over the console with a divider between them (B-COD-30): dragged with a mouse, a pen or a finger, or
 * moved by the arrows, Home and End once focused. The divider is a vertical slider over the whole pane (only its
 * thumb takes the pointer), so it is announced and keyed like one; the share is stored when the drag ends.
 */
export function SplitPane({ top, bottom, share, onShare, label }: SplitPaneProps) {
  const name = useId()
  const [dragged, setDragged] = useState<number | null>(null)
  const shown = clampSplit(dragged ?? share)
  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      // The thumb is centred on the boundary; the top pane ends half a divider above it.
      style={{ '--top': `calc(${percent(shown)}% - 0.375rem)` } as Shares}
    >
      <div className="flex min-h-0 shrink-0 basis-(--top) flex-col">{top}</div>
      <div aria-hidden className="h-3 shrink-0 border-y bg-muted" />
      <div className="flex min-h-0 flex-1 flex-col">{bottom}</div>
      <Slider.Root
        aria-labelledby={name}
        orientation="vertical"
        value={100 - percent(shown)}
        // 0-100, not the allowed 15-70: the thumb is placed along [min, max], and it must sit on the boundary.
        min={0}
        max={100}
        step={percent(SPLIT_STEP)}
        thumbAlignment="center"
        onValueChange={value => setDragged(fromValue(value))}
        onValueCommitted={value => {
          onShare(fromValue(value))
          setDragged(null)
        }}
        className="pointer-events-none absolute inset-0"
      >
        <span id={name} className="sr-only">
          {label}
        </span>
        <Slider.Control className="relative size-full touch-none select-none">
          <Slider.Thumb
            getAriaValueText={() => m.code_split_value({ percent: percent(shown) })}
            className="pointer-events-auto h-3 w-full cursor-row-resize after:absolute after:inset-x-0 after:top-1/2 after:mx-auto after:h-1 after:w-10 after:-translate-y-1/2 after:rounded-full after:bg-border after:transition-colors after:duration-150 hover:after:bg-muted-foreground has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-ring data-dragging:after:bg-muted-foreground"
          />
        </Slider.Control>
      </Slider.Root>
    </div>
  )
}
