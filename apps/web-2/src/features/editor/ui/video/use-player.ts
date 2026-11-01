import { useThrottler } from '@tanstack/react-pacer'
import { use, useEffect, useEffectEvent, useState, type SyntheticEvent } from 'react'

import type { Command } from '../../model/video-player'
import { VideoEndedContext } from '../../model/video-ended'
import { applyCommand, setRate, setVolume, togglePlay, type Flash } from './apply-command'
import { restorePreferences, savedPosition, savePosition } from './saved'
import { useFullscreen } from './use-fullscreen'
import { useMediaState } from './use-media-state'
import { usePictureInPicture } from './use-picture-in-picture'
import { useQuietValue } from './use-quiet-value'

/** While playing, the controls step aside this long after the pointer last moved. */
const IDLE_MS = 2500
const FLASH_MS = 700
const RESUME_NOTICE_MS = 6000
/** The watched position is written at most this often while playing (and on pause, end and leaving). */
const SAVE_EVERY_MS = 5000

type VideoEvent = SyntheticEvent<HTMLVideoElement>

/** The watched position, saved while playing and dropped at the end; the lesson player hears about the end. */
function usePositionSaving(src: string) {
  const ended = use(VideoEndedContext)
  const save = useThrottler((time: number, duration: number) => savePosition(src, time, duration), {
    wait: SAVE_EVERY_MS,
    onUnmount: throttler => throttler.flush(),
  })
  const now = ({ currentTarget }: VideoEvent, time = currentTarget.currentTime) => {
    save.cancel()
    savePosition(src, time, currentTarget.duration)
  }
  return {
    onTimeUpdate: ({ currentTarget }: VideoEvent) =>
      save.maybeExecute(currentTarget.currentTime, currentTarget.duration),
    onPause: (event: VideoEvent) => now(event),
    onEnded: (event: VideoEvent) => {
      now(event, event.currentTarget.duration)
      ended?.()
    },
  }
}

/** Everything one hosted video's player needs: the element, its state, the commands and what is on screen. */
export function usePlayer(src: string, frame: HTMLElement | null, video: HTMLVideoElement | null) {
  const state = useMediaState(video)
  const fullscreen = useFullscreen(frame, video)
  const pip = usePictureInPicture(video)
  const flash = useQuietValue<Flash>(FLASH_MS)
  const resumed = useQuietValue<number>(RESUME_NOTICE_MS)
  const active = useQuietValue<true>(IDLE_MS)
  const [menuOpen, setMenuOpen] = useState(false)
  const [onControl, setOnControl] = useState(false)
  // Preferences and the saved position apply once the duration is known (also when it was known before hydration).
  const loaded = useEffectEvent((element: HTMLVideoElement) => {
    restorePreferences(element)
    const at = savedPosition(src, element.duration)
    if (at === null) return
    element.currentTime = at
    resumed.set(at)
  })
  useEffect(() => {
    const element = video
    if (!element) return undefined
    const onLoaded = () => loaded(element)
    if (element.readyState >= HTMLMediaElement.HAVE_METADATA) onLoaded()
    element.addEventListener('loadedmetadata', onLoaded)
    return () => element.removeEventListener('loadedmetadata', onLoaded)
  }, [video])
  const effects = { flash: flash.set, fullscreen: fullscreen.toggle, pip: pip.toggle }
  const withElement = (act: (element: HTMLVideoElement) => void) => () => video && act(video)
  return {
    state,
    fullscreen,
    pip,
    flash: flash.value,
    resumed,
    active,
    // Paused, the controls stay; playing, they show while the pointer moves, a menu is open or a key moved focus there.
    shown: !state.playing || active.value !== null || menuOpen || onControl,
    setMenuOpen,
    setOnControl,
    saving: usePositionSaving(src),
    run: (command: Command) => withElement(element => applyCommand(element, command, effects))(),
    toggle: withElement(togglePlay),
    seek: (time: number) => withElement(element => (element.currentTime = time))(),
    setVolume: (volume: number) => withElement(element => setVolume(element, volume))(),
    setRate: (rate: number) => withElement(element => setRate(element, rate))(),
  }
}

export type Player = ReturnType<typeof usePlayer>
