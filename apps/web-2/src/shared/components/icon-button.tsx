import type { ComponentProps, ReactNode } from 'react'

import { printedKeys } from '#/shared/lib/key-label'
import { Button } from '#/shared/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/shared/ui/tooltip'

type IconButtonProps = Omit<
  ComponentProps<typeof Button>,
  'className' | 'children' | 'aria-label' | 'variant' | 'size'
> & {
  /** The action's name: the accessible name and the tooltip (DESIGN 8). */
  label: string
  /** One lucide icon, `aria-hidden`. */
  icon: ReactNode
  /** Its key combo (`Mod-Enter`), printed in the tooltip for this platform. */
  keys?: string | undefined
}

/**
 * An icon-only action: stock `Button` (ghost, size icon) inside a stock `Tooltip`, so the name and the tooltip can
 * never drift apart; a shortcut, when it has one, is printed beside the name. Usable as the `render` of a dialog,
 * sheet or menu trigger: it forwards their props. Disabled, it stays focusable (aria-disabled): focus is not dropped
 * while a request runs, and the tooltip can still say what it is.
 */
export function IconButton({ label, icon, keys, ...props }: IconButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        delay={300}
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={label}
            focusableWhenDisabled
            className="aria-disabled:opacity-50"
            {...props}
          />
        }
      >
        {icon}
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {keys ? (
          <kbd data-slot="kbd" className="bg-background/15 px-1 font-sans tabular-nums">
            {printedKeys(keys)}
          </kbd>
        ) : null}
      </TooltipContent>
    </Tooltip>
  )
}
