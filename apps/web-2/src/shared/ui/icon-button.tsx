import { Button as BaseButton } from '@base-ui/react/button'
import { Tooltip } from '@base-ui/react/tooltip'
import type { ComponentProps, ReactNode } from 'react'

import { buttonVariants } from './button'

type IconButtonProps = Omit<ComponentProps<typeof BaseButton>, 'className' | 'render' | 'children' | 'aria-label'> & {
  /** The action's name: the accessible name and the tooltip (DESIGN 8). */
  label: string
  /** One lucide icon, `aria-hidden`. */
  icon: ReactNode
}

/** An icon-only button. Usable as a `trigger` of Dialog, Sheet and the menus: it forwards their props. */
export function IconButton({ label, icon, type = 'button', ...props }: IconButtonProps) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        delay={300}
        render={
          <BaseButton
            type={type}
            aria-label={label}
            className={buttonVariants({ variant: 'ghost', size: 'icon' })}
            {...props}
          />
        }
      >
        {icon}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={6} className="z-50">
          <Tooltip.Popup className="rounded-md bg-foreground px-2 py-1 text-xs text-background shadow-md transition-opacity duration-100 data-ending-style:opacity-0 data-starting-style:opacity-0">
            {label}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}
