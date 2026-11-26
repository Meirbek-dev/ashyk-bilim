import { useState, type ReactNode } from 'react'

import { m } from '#/paraglide/messages'
import { Resizable, ResizableHandle, ResizablePanel } from '#/shared/ui/resizable'

import { clampSplit, SPLIT_MAX, SPLIT_MIN, SPLIT_STEP } from '../../model/ide'

type SplitPaneProps = {
  top: ReactNode
  bottom: ReactNode
  /** The top pane's share of the height (0.3-0.85). */
  share: number
  /** The new share once a drag ends or a key moved the divider. */
  onShare: (share: number) => void
  label: string
}

const percent = (share: number) => share * 100

/**
 * The editor over the console with a divider between them (B-COD-30): dragged with a mouse, a pen or a finger, or
 * moved by the arrows, Home and End once focused. The share is stored when the drag or the key press ends.
 */
export function SplitPane({ top, bottom, share, onShare, label }: SplitPaneProps) {
  const [dragged, setDragged] = useState<number | null>(null)
  const shown = percent(clampSplit(dragged ?? share))
  return (
    <Resizable
      orientation="vertical"
      layout={[shown, 100 - shown]}
      step={percent(SPLIT_STEP)}
      onLayoutChange={([next = shown]) => setDragged(next / 100)}
      onLayoutCommit={([next = shown]) => {
        onShare(clampSplit(next / 100))
        setDragged(null)
      }}
      className="flex-1"
    >
      <ResizablePanel minSize={percent(SPLIT_MIN)} maxSize={percent(SPLIT_MAX)} className="flex flex-col">
        {top}
      </ResizablePanel>
      {/* One hairline with the grip under it: the editor's status line and the console's tabs keep their own rules. */}
      <ResizableHandle
        aria-label={label}
        aria-valuetext={m.code_split_value({ percent: Math.round(shown) })}
        className="h-3 border-t bg-transparent after:absolute after:inset-x-0 after:top-1/2 after:mx-auto after:h-1 after:w-10 after:-translate-y-1/2 after:rounded-full after:bg-border after:transition-colors after:duration-150 hover:bg-transparent hover:after:bg-muted-foreground focus-visible:ring-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring data-dragging:bg-transparent data-dragging:after:bg-muted-foreground data-hovering:bg-transparent data-hovering:after:bg-muted-foreground"
      />
      <ResizablePanel className="flex flex-col">{bottom}</ResizablePanel>
    </Resizable>
  )
}
