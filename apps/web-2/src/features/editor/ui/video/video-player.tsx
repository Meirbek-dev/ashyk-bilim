import { use, useState } from 'react'

import { m } from '#/paraglide/messages'

import { AuthorViewContext } from '../../model/video-ended'
import { PlayerFrameContext } from './frame-context'
import { PlayerControls } from './player-controls'
import { PlayerFlash } from './player-flash'
import { StageCenter } from './stage-center'
import { useFrameEvents } from './use-frame-events'
import { usePlayer } from './use-player'

/** Why the frame is empty, and what to do: a learner tells the teacher, the author uploads again (B-EDT-19). */
const failedText = (author: boolean) => (author ? m.editor_video_failed_author() : m.editor_video_failed())

/**
 * A hosted video file: the native `<video>` on a dark 16:9 stage with our own controls (position with what is loaded,
 * skips, sound, speed, picture in picture, full screen), keyboard shortcuts while focus is in the player, and volume,
 * speed and the watched position remembered between visits. A file the browser cannot decode says so instead.
 */
export function VideoPlayer({ src }: { src: string }) {
  const [frame, setFrame] = useState<HTMLDivElement | null>(null)
  const [video, setVideo] = useState<HTMLVideoElement | null>(null)
  const player = usePlayer(src, frame, video)
  useFrameEvents(frame, video, player)
  const author = use(AuthorViewContext)
  const { state, saving } = player
  return (
    <PlayerFrameContext value={frame}>
      <div
        ref={setFrame}
        data-fullscreen={player.fullscreen.active || undefined}
        data-idle={!player.shown || undefined}
        className="@container relative isolate flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl bg-media text-media-foreground select-none data-fullscreen:aspect-auto data-fullscreen:rounded-none data-idle:cursor-none"
      >
        <video
          ref={setVideo}
          src={src}
          preload="metadata"
          playsInline
          onTimeUpdate={saving.onTimeUpdate}
          onPause={saving.onPause}
          onEnded={saving.onEnded}
          hidden={state.failed}
          className="size-full object-contain"
        >
          <track kind="captions" />
        </video>
        {state.failed ? (
          <p role="alert" className="max-w-prose p-6 text-center text-sm">
            {failedText(author)}
          </p>
        ) : (
          <>
            <StageCenter state={state} />
            <PlayerFlash flash={player.flash} />
            <PlayerControls player={player} />
          </>
        )}
      </div>
    </PlayerFrameContext>
  )
}
