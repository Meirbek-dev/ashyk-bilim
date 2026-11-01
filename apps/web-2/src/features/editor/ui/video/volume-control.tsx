import { Slider } from '@base-ui/react/slider'
import { Volume1, Volume2, VolumeX } from 'lucide-react'
import { useId } from 'react'

import { m } from '#/paraglide/messages'
import { formatPercent } from '#/shared/i18n/format'

import { PlayerButton } from './player-button'

type Volume = { volume: number; muted: boolean; onMute: () => void; onVolume: (volume: number) => void }

const volumeIcon = (level: number) => {
  if (level === 0) return <VolumeX aria-hidden />
  return level < 0.5 ? <Volume1 aria-hidden /> : <Volume2 aria-hidden />
}

/** Sound on/off (M), and from a medium-wide frame up a volume slider beside it (arrows: 5 %). */
export function VolumeControl({ volume, muted, onMute, onVolume }: Volume) {
  const label = useId()
  const level = muted ? 0 : volume
  return (
    <div className="flex items-center">
      <PlayerButton
        label={m.editor_video_mute()}
        shortcut="M"
        aria-pressed={muted}
        icon={volumeIcon(level)}
        onClick={onMute}
      />
      <span id={label} className="sr-only">
        {m.editor_video_volume()}
      </span>
      <Slider.Root
        aria-labelledby={label}
        value={level}
        max={1}
        step={0.05}
        thumbAlignment="center"
        onValueChange={value => onVolume(value)}
        className="group/volume hidden w-20 px-2 @md:block"
      >
        <Slider.Control className="relative flex h-4 w-full cursor-pointer touch-none items-center select-none">
          <Slider.Track className="relative h-1 w-full overflow-hidden rounded-full bg-media-foreground/25">
            <Slider.Indicator className="h-full bg-media-foreground" />
          </Slider.Track>
          <Slider.Thumb
            getAriaValueText={(_, value) => formatPercent(value * 100)}
            className="size-3 rounded-full bg-media-foreground has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring"
          />
        </Slider.Control>
      </Slider.Root>
    </div>
  )
}
