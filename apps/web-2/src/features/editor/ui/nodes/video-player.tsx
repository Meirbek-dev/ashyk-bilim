import { Slider } from '@base-ui/react/slider'
import { Maximize, Pause, Play, Volume2, VolumeX } from 'lucide-react'
import { useRef, useState } from 'react'

import { m } from '#/paraglide/messages'
import { IconButton } from '#/shared/ui/icon-button'

import { clock } from '../../model/file-blocks'

/** A hosted video file: the native `<video>` with kit controls (play, position, time, sound, full screen). */
export function VideoPlayer({ src }: { src: string }) {
  const frame = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const toggle = () => {
    const element = video.current
    // play() rejects when the browser blocks it or the source fails; the button state follows the media events.
    if (element?.paused) void element.play().catch(() => null)
    else element?.pause()
  }
  return (
    <div ref={frame} className="flex flex-col overflow-hidden rounded-lg bg-muted">
      <video
        ref={video}
        src={src}
        preload="metadata"
        playsInline
        onClick={toggle}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={event => setTime(event.currentTarget.currentTime)}
        onLoadedMetadata={event => setDuration(event.currentTarget.duration)}
        onVolumeChange={event => setMuted(event.currentTarget.muted)}
        className="w-full"
      >
        <track kind="captions" />
      </video>
      <div className="flex items-center gap-2 px-2 py-1">
        <IconButton
          label={playing ? m.editor_video_pause() : m.editor_video_play()}
          icon={playing ? <Pause aria-hidden /> : <Play aria-hidden />}
          onClick={toggle}
        />
        <Slider.Root
          value={time}
          max={duration || 1}
          step={1}
          onValueChange={value => {
            if (video.current) video.current.currentTime = value
            setTime(value)
          }}
          className="min-w-0 flex-1"
        >
          <Slider.Control className="flex h-6 items-center">
            <Slider.Track className="h-1 w-full rounded-full bg-border">
              <Slider.Indicator className="rounded-full bg-primary" />
              <Slider.Thumb
                getAriaLabel={() => m.editor_video_position()}
                getAriaValueText={() => clock(time)}
                className="size-3 rounded-full bg-primary"
              />
            </Slider.Track>
          </Slider.Control>
        </Slider.Root>
        <span className="text-xs text-muted-foreground tabular-nums">{`${clock(time)} / ${clock(duration)}`}</span>
        <IconButton
          label={m.editor_video_mute()}
          icon={muted ? <VolumeX aria-hidden /> : <Volume2 aria-hidden />}
          aria-pressed={muted}
          onClick={() => {
            if (video.current) video.current.muted = !video.current.muted
          }}
        />
        <IconButton
          label={m.editor_video_fullscreen()}
          icon={<Maximize aria-hidden />}
          onClick={() => void frame.current?.requestFullscreen().catch(() => null)}
        />
      </div>
    </div>
  )
}
