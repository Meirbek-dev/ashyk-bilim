import { cn } from 'cn'

import { ControlRow } from './control-row'
import { ResumeNotice } from './resume-notice'
import { SeekBar } from './seek-bar'
import type { Player } from './use-player'

/**
 * The control dock over the bottom of the picture: the resume notice, the position bar and the button row. Fades out
 * while a video plays untouched.
 */
export function PlayerControls({ player }: { player: Player }) {
  const { state, resumed } = player
  return (
    <div
      className={cn(
        'absolute inset-x-0 bottom-0 flex flex-col items-start gap-2 p-2 transition-opacity duration-200 @md:p-3',
        player.shown ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      {resumed.value === null ? null : (
        <ResumeNotice
          at={resumed.value}
          onRestart={() => {
            player.seek(0)
            resumed.clear()
          }}
        />
      )}
      <div className="flex w-full flex-col rounded-lg bg-media/70 px-2 pt-1 pb-0.5">
        <SeekBar time={state.time} duration={state.duration} buffered={state.buffered} onSeek={player.seek} />
        <ControlRow player={player} />
      </div>
    </div>
  )
}
