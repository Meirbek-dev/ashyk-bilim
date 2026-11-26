import type { ComponentProps } from 'react'

import { Toggle } from '#/shared/ui/toggle'

import { ON_STAGE, StageTooltip, type Shown } from './stage-tooltip'

type PlayerToggleProps = Omit<
  ComponentProps<typeof Toggle>,
  'className' | 'children' | 'aria-label' | 'variant' | 'size'
> &
  Shown

/** A player control that stays on or off, like sound or picture in picture; the icon shows the state, not a fill. */
export function PlayerToggle({ label, icon, shortcut, ...props }: PlayerToggleProps) {
  return (
    <StageTooltip
      label={label}
      shortcut={shortcut}
      icon={icon}
      control={
        <Toggle
          size="icon-lg"
          aria-label={label}
          className={`${ON_STAGE} data-pressed:bg-transparent data-pressed:text-media-foreground data-pressed:hover:bg-media-foreground/15`}
          {...props}
        />
      }
    />
  )
}
