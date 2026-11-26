import { Volume1, Volume2, VolumeX } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { formatPercent } from '#/shared/i18n/format'
import { Slider, SliderControl, SliderIndicator, SliderThumb, SliderTrack } from '#/shared/ui/slider'

import { PlayerToggle } from './player-toggle'

type Volume = { volume: number; muted: boolean; onMute: () => void; onVolume: (volume: number) => void }

const volumeIcon = (level: number) => {
  if (level === 0) return <VolumeX aria-hidden />
  return level < 0.5 ? <Volume1 aria-hidden /> : <Volume2 aria-hidden />
}

/** Sound on/off (M), and from a medium-wide frame up a volume slider beside it (arrows: 5 %). */
export function VolumeControl({ volume, muted, onMute, onVolume }: Volume) {
  const level = muted ? 0 : volume
  return (
    <div className="flex items-center">
      <PlayerToggle
        label={m.editor_video_mute()}
        shortcut="M"
        pressed={muted}
        icon={volumeIcon(level)}
        onPressedChange={() => onMute()}
      />
      <Slider
        value={level}
        max={1}
        step={0.05}
        format={value => formatPercent(value * 100)}
        onValueChange={value => onVolume(value)}
        className="group/volume hidden w-20 px-2 @md:block"
      >
        <SliderControl className="h-4">
          <SliderTrack className="bg-media-foreground/25">
            <SliderIndicator className="rounded-e-none bg-media-foreground" />
            <SliderThumb
              aria-label={m.editor_video_volume()}
              className="size-3 border-0 bg-media-foreground shadow-none has-focus-visible:ring-0 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring"
            />
          </SliderTrack>
        </SliderControl>
      </Slider>
    </div>
  )
}
