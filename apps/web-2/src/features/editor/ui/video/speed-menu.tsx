import { Gauge } from 'lucide-react'
import { use } from 'react'

import { m } from '#/paraglide/messages'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '#/shared/ui/dropdown-menu'

import { RATES } from '../../model/video-player'
import { PlayerFrameContext } from './frame-context'
import { PlayerButton } from './player-button'
import { rateLabel } from './rate-label'

type Speed = { rate: number; onRate: (rate: number) => void; onOpenChange: (open: boolean) => void }

/**
 * Playback speed, 0.5x to 2x (also Shift + < and >). The stock menu in the stage's colours, rendered into the player's
 * frame so it opens in full screen too. The button shows a speed other than normal.
 */
export function SpeedMenu({ rate, onRate, onOpenChange }: Speed) {
  const frame = use(PlayerFrameContext)
  const current = rate === 1 ? <Gauge aria-hidden /> : <span className="text-xs tabular-nums">{rateLabel(rate)}</span>
  return (
    <DropdownMenu onOpenChange={open => onOpenChange(open)}>
      <DropdownMenuTrigger render={<PlayerButton label={m.editor_video_speed()} shortcut="< >" icon={current} />} />
      <DropdownMenuContent
        container={frame}
        side="top"
        align="end"
        sideOffset={10}
        className="min-w-36 bg-media p-1 text-media-foreground shadow-md ring-media-foreground/15"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-1.5 py-1 font-medium text-media-foreground/75">
            {m.editor_video_speed()}
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup value={String(rate)} onValueChange={value => onRate(Number(value))}>
            {RATES.map(value => (
              <DropdownMenuRadioItem
                key={value}
                value={String(value)}
                className="tabular-nums data-highlighted:bg-media-foreground/15 data-highlighted:text-media-foreground"
              >
                {rateLabel(value)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
