import type { ComponentProps, ReactNode } from 'react'

import { Button } from '#/shared/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/shared/ui/tooltip'

import { printedKeys } from '#/shared/lib/key-label'

type ToolButtonProps = Omit<
  ComponentProps<typeof Button>,
  'className' | 'children' | 'aria-label' | 'variant' | 'size'
> & {
  /** The action's name: the accessible name and the tooltip. */
  label: string
  /** One lucide icon, `aria-hidden`. */
  icon: ReactNode
  /** Its key combo in Tiptap notation (`Mod-b`), printed in the tooltip for this platform. */
  keys?: string | undefined
  /** `icon-xs` beside a block (the block handle); toolbar tools are `icon`. */
  size?: 'icon' | 'icon-xs'
}

/**
 * An editor tool: stock `Button` (ghost, icon) in a stock `Tooltip` that names it and prints its shortcut. Like
 * `IconButton`, it forwards trigger props (menus, dialogs) and stays focusable while disabled.
 */
export function ToolButton({ label, icon, keys, size = 'icon', ...props }: ToolButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        delay={300}
        render={
          <Button
            variant="ghost"
            size={size}
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
