import { Menu } from '@base-ui/react/menu'
import { Gauge } from 'lucide-react'
import { use } from 'react'

import { m } from '#/paraglide/messages'
import { DropdownMenuRadioItem } from '#/shared/ui/dropdown-menu'

import { RATES } from '../../model/video-player'
import { PlayerFrameContext } from './frame-context'
import { PlayerButton } from './player-button'
import { rateLabel } from './rate-label'

type Speed = { rate: number; onRate: (rate: number) => void; onOpenChange: (open: boolean) => void }

/**
 * Playback speed, 0.5x to 2x (also Shift + < and >). The stock menu parts on Base UI's root, portalled into the
 * player's frame instead of `<body>` so the menu opens in full screen too. The button shows a speed other than normal.
 */
export function SpeedMenu({ rate, onRate, onOpenChange }: Speed) {
  const frame = use(PlayerFrameContext)
  const current = rate === 1 ? <Gauge aria-hidden /> : <span className="text-xs tabular-nums">{rateLabel(rate)}</span>
  return (
    <Menu.Root onOpenChange={open => onOpenChange(open)}>
      <Menu.Trigger render={<PlayerButton label={m.editor_video_speed()} shortcut="< >" icon={current} />} />
      <Menu.Portal container={frame}>
        <Menu.Positioner side="top" align="end" sideOffset={10} className="isolate z-50 outline-none">
          <Menu.Popup className="max-h-(--available-height) min-w-36 overflow-y-auto rounded-lg bg-media p-1 text-media-foreground shadow-md ring-1 ring-media-foreground/15 outline-none">
            <Menu.Group>
              <Menu.GroupLabel className="px-1.5 py-1 text-xs font-medium text-media-foreground/75">
                {m.editor_video_speed()}
              </Menu.GroupLabel>
              <Menu.RadioGroup value={rate} onValueChange={value => onRate(Number(value))}>
                {RATES.map(value => (
                  <DropdownMenuRadioItem
                    key={value}
                    value={value}
                    className="tabular-nums focus:bg-media-foreground/15 focus:text-media-foreground"
                  >
                    {rateLabel(value)}
                  </DropdownMenuRadioItem>
                ))}
              </Menu.RadioGroup>
            </Menu.Group>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
