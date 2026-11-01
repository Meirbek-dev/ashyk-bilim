import { Maximize, Minimize, Pause, PictureInPicture2, Play, RotateCcw, RotateCw } from 'lucide-react'

import { m } from '#/paraglide/messages'

import { clock } from '../../model/file-blocks'
import { SKIP_SECONDS } from '../../model/video-player'
import { PlayerButton } from './player-button'
import { SpeedMenu } from './speed-menu'
import type { Player } from './use-player'
import { VolumeControl } from './volume-control'

const playLabel = ({ playing, ended }: Player['state']) => {
  if (playing) return m.editor_video_pause()
  return ended ? m.editor_video_replay() : m.editor_video_play()
}

/** Play, skips, sound and time on the left; speed, picture in picture and full screen on the right. */
export function ControlRow({ player }: { player: Player }) {
  const { state, run, pip } = player
  const fullscreen = player.fullscreen.active
  return (
    <div className="flex items-center gap-0.5">
      <PlayerButton
        data-play
        label={playLabel(state)}
        shortcut="K"
        icon={
          state.playing ? <Pause aria-hidden className="fill-current" /> : <Play aria-hidden className="fill-current" />
        }
        onClick={player.toggle}
      />
      <PlayerButton
        label={m.editor_video_back()}
        shortcut="J"
        icon={<RotateCcw aria-hidden />}
        onClick={() => run({ kind: 'seek-by', seconds: -SKIP_SECONDS })}
      />
      <PlayerButton
        label={m.editor_video_forward()}
        shortcut="L"
        icon={<RotateCw aria-hidden />}
        onClick={() => run({ kind: 'seek-by', seconds: SKIP_SECONDS })}
      />
      <VolumeControl
        volume={state.volume}
        muted={state.muted}
        onMute={() => run({ kind: 'mute' })}
        onVolume={player.setVolume}
      />
      <span className="px-1 text-xs whitespace-nowrap tabular-nums @md:text-sm">{`${clock(state.time)} / ${clock(state.duration)}`}</span>
      <span className="flex-1" />
      <SpeedMenu rate={state.rate} onRate={player.setRate} onOpenChange={player.setMenuOpen} />
      {pip.supported ? (
        <span className="hidden @sm:contents">
          <PlayerButton
            label={m.editor_video_pip()}
            shortcut="I"
            aria-pressed={pip.active}
            icon={<PictureInPicture2 aria-hidden />}
            onClick={pip.toggle}
          />
        </span>
      ) : null}
      <PlayerButton
        label={fullscreen ? m.editor_video_fullscreen_exit() : m.editor_video_fullscreen()}
        shortcut="F"
        icon={fullscreen ? <Minimize aria-hidden /> : <Maximize aria-hidden />}
        onClick={player.fullscreen.toggle}
      />
    </div>
  )
}
