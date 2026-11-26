import type { ComponentProps } from 'react'

import { Button } from '#/shared/ui/button'

import { ON_STAGE, StageTooltip, type Shown } from './stage-tooltip'

type PlayerButtonProps = Omit<
  ComponentProps<typeof Button>,
  'className' | 'children' | 'aria-label' | 'variant' | 'size'
> &
  Shown

/** A player control: stock `Button` (ghost, icon-lg) with a tooltip. Forwards trigger props: usable as the speed menu's `render`. */
export function PlayerButton({ label, icon, shortcut, ...props }: PlayerButtonProps) {
  return (
    <StageTooltip
      label={label}
      shortcut={shortcut}
      icon={icon}
      control={<Button variant="ghost" size="icon-lg" aria-label={label} className={ON_STAGE} {...props} />}
    />
  )
}
