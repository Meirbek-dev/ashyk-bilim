import type { ComponentProps, ReactNode } from 'react'

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
}

/**
 * An icon-only action: stock `Button` (ghost, size icon) inside a stock `Tooltip`, so the name and the tooltip can
 * never drift apart. Usable as the `render` of a dialog, sheet or menu trigger: it forwards their props.
 */
export function IconButton({ label, icon, ...props }: IconButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger delay={300} render={<Button variant="ghost" size="icon" aria-label={label} {...props} />}>
        {icon}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
