import { use, type ReactElement, type ReactNode } from 'react'

import { Tooltip, TooltipContent, TooltipTrigger } from '#/shared/ui/tooltip'

import { PlayerFrameContext } from './frame-context'

export type Shown = {
  /** The action's name: the accessible name and the tooltip. */
  label: string
  /** One lucide icon, `aria-hidden` (or the current speed as text). */
  icon: ReactNode
  /** The key that does the same, shown in the tooltip. */
  shortcut?: string
}

/** Ink on the picture: the stock ghost button with the stage's own colours (hover and an open menu tint alike). */
export const ON_STAGE =
  'text-media-foreground hover:bg-media-foreground/15 hover:text-media-foreground aria-expanded:bg-media-foreground/15 aria-expanded:text-media-foreground'

/** A player control's tooltip, rendered into the player's frame so it still shows in full screen. */
export function StageTooltip({ label, shortcut, icon, control }: Shown & { control: ReactElement }) {
  const frame = use(PlayerFrameContext)
  return (
    <Tooltip delay={300}>
      <TooltipTrigger render={control}>{icon}</TooltipTrigger>
      <TooltipContent
        container={frame}
        sideOffset={10}
        className="flex gap-2 bg-media px-2 py-1 text-media-foreground shadow-md"
      >
        {label}
        {shortcut ? (
          <kbd className="rounded-sm border border-media-foreground/30 px-1 font-mono">{shortcut}</kbd>
        ) : null}
      </TooltipContent>
    </Tooltip>
  )
}
