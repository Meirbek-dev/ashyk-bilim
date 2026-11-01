import { Tooltip } from '@base-ui/react/tooltip'
import { use, type ComponentProps, type ReactNode } from 'react'

import { Button } from '#/shared/ui/button'

import { PlayerFrameContext } from './frame-context'

type PlayerButtonProps = Omit<
  ComponentProps<typeof Button>,
  'className' | 'children' | 'aria-label' | 'variant' | 'size'
> & {
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

/**
 * A player control: stock `Button` (ghost, icon-lg) with a tooltip that portals into the player's frame, so it still
 * shows in full screen. Forwards trigger props: usable as the speed menu's `render`.
 */
export function PlayerButton({ label, icon, shortcut, ...props }: PlayerButtonProps) {
  const frame = use(PlayerFrameContext)
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        delay={300}
        render={<Button variant="ghost" size="icon-lg" aria-label={label} className={ON_STAGE} {...props} />}
      >
        {icon}
      </Tooltip.Trigger>
      <Tooltip.Portal container={frame}>
        <Tooltip.Positioner side="top" sideOffset={10} className="isolate z-50">
          <Tooltip.Popup className="flex items-center gap-2 rounded-md bg-media px-2 py-1 text-xs text-media-foreground shadow-md transition-opacity duration-100 data-open:opacity-100 data-closed:opacity-0">
            {label}
            {shortcut ? (
              <kbd className="rounded-sm border border-media-foreground/30 px-1 font-mono">{shortcut}</kbd>
            ) : null}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}
