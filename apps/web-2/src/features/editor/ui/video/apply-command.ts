import { m } from '#/paraglide/messages'
import { formatNumber, formatPercent } from '#/shared/i18n/format'

import { clampVolume, nextRate, seekTarget, type Command } from '../../model/video-player'
import { rateLabel } from './rate-label'
import { savePreferences } from './saved'

/** The short feedback over the picture after a key or a skip button: what changed, with an icon. */
export type Flash = { icon: 'back' | 'forward' | 'volume' | 'muted' | 'rate'; text: string }

type Effects = { flash: (flash: Flash) => void; fullscreen: () => void; pip: () => void }

export function togglePlay(element: HTMLVideoElement) {
  if (element.paused || element.ended) void element.play().catch(() => null)
  else element.pause()
}

const volumeFlash = (element: HTMLVideoElement): Flash =>
  element.muted || element.volume === 0
    ? { icon: 'muted', text: m.editor_video_muted() }
    : { icon: 'volume', text: m.editor_video_volume_value({ percent: formatPercent(element.volume * 100) }) }

export function setVolume(element: HTMLVideoElement, volume: number) {
  element.volume = clampVolume(volume)
  element.muted = element.volume === 0
  savePreferences(element)
}

function seek(element: HTMLVideoElement, command: Command, effects: Effects) {
  const to = seekTarget(element.currentTime, element.duration, command)
  if (to === null) return
  element.currentTime = to
  if (command.kind !== 'seek-by') return
  const seconds = formatNumber(command.seconds, { signed: true })
  effects.flash({ icon: command.seconds < 0 ? 'back' : 'forward', text: m.editor_video_skipped({ seconds }) })
}

/** Runs a player command (a key or a control) on the element. */
export function applyCommand(element: HTMLVideoElement, command: Command, effects: Effects) {
  switch (command.kind) {
    case 'toggle':
      return togglePlay(element)
    case 'seek-by':
    case 'seek-to':
      return seek(element, command, effects)
    case 'volume-by':
      element.muted = false
      setVolume(element, element.volume + command.delta)
      return effects.flash(volumeFlash(element))
    case 'mute':
      element.muted = !element.muted
      // Unmuting a video turned all the way down brings the sound back at a hearable level.
      if (!element.muted && element.volume === 0) element.volume = 0.5
      savePreferences(element)
      return effects.flash(volumeFlash(element))
    case 'rate':
      element.playbackRate = nextRate(element.playbackRate, command.step)
      savePreferences(element)
      return effects.flash({ icon: 'rate', text: rateLabel(element.playbackRate) })
    case 'fullscreen':
      return effects.fullscreen()
    case 'pip':
      return effects.pip()
  }
}

export function setRate(element: HTMLVideoElement, rate: number) {
  element.defaultPlaybackRate = rate
  element.playbackRate = rate
  savePreferences(element)
}
