import type ArtplayerType from 'artplayer'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import Artplayer from 'artplayer'
import { useTranslations } from 'next-intl'
import { MediaUnavailable, useMediaMissing } from '@components/Objects/Activities/Media/MediaUnavailable'

interface SubtitleEntry {
  html: string
  url: string
}

interface PlayerProps {
  option: Record<string, unknown>
  getInstance?: (art: Artplayer) => void
  subtitle?: unknown
  subtitleEntries?: SubtitleEntry[]
  startTime?: number
  endTime?: number | null
  onPlayerReady?: (art: Artplayer) => void
  [key: string]: unknown
}
const captionsSVGString = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-captions-icon lucide-captions"><rect width="18" height="14" x="3" y="5" rx="2" ry="2" /><path d="M7 15h4M15 15h2M7 11h2M13 11h4" /></svg>`

const EMPTY_SUBTITLE_ENTRIES: SubtitleEntry[] = []

export default function ArtPlayer({
  option,
  getInstance,
  subtitle,
  subtitleEntries = EMPTY_SUBTITLE_ENTRIES,
  startTime,
  endTime,
  onPlayerReady,
  ...rest
}: PlayerProps) {
  const artRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<ArtplayerType | null>(null)
  const t = useTranslations('Components.VideoPlayer')
  // UX-221: a missing object would only ever show «Reconnect: N».
  const missing = useMediaMissing(option.url as string | undefined)
  // A file the browser cannot open (a renamed non-video, AVI/FLV, a corrupt upload) would
  // otherwise spin on «Reconnect: N» forever.
  const [unplayable, setUnplayable] = useState(false)
  useEffect(() => {
    if ((missing || unplayable) && instanceRef.current && !instanceRef.current.isDestroy)
      instanceRef.current.destroy(false)
  }, [missing, unplayable])

  const playerStrings = () => ({
    Play: t('ui.play'),
    Pause: t('ui.pause'),
    Volume: t('ui.volume'),
    Mute: t('ui.mute'),
    'Play Speed': t('ui.playSpeed'),
    Normal: t('ui.normal'),
    Fullscreen: t('ui.fullscreen'),
    'Exit Fullscreen': t('ui.exitFullscreen'),
    'PIP Mode': t('ui.pipMode'),
    'Exit PIP Mode': t('ui.exitPipMode'),
    'PIP Not Supported': t('ui.pipNotSupported'),
    'Fullscreen Not Supported': t('ui.fullscreenNotSupported'),
    'Mini Player': t('ui.miniPlayer'),
    'Show Setting': t('ui.showSetting'),
    'Hide Setting': t('ui.hideSetting'),
    'Last Seen': t('ui.lastSeen'),
    'Jump Play': t('ui.jumpPlay'),
    'Video Load Failed': t('ui.videoLoadFailed'),
    Reconnect: t('ui.reconnect'),
    Close: t('ui.close'),
  })

  // One player per mount: the props are read when the container mounts.
  const createPlayer = useEffectEvent((container: HTMLDivElement) => {
    const art: ArtplayerType = new Artplayer({
      url: (option.url as string) || '',
      ...option,
      container,
      volume: 1,
      isLive: false,
      pip: !!option.pip,
      autoOrientation: true,
      autoSize: true,
      autoMini: true,
      screenshot: false,
      setting: true,
      loop: false,
      flip: false,
      playbackRate: true,
      aspectRatio: false,
      fullscreen: true,
      fullscreenWeb: false,
      hotkey: true,
      subtitleOffset: false,
      miniProgressBar: false,
      mutex: true,
      autoPlayback: true,
      airplay: true,
      theme: '#23ade5',
      // UX-B4: Artplayer ships English (and no Kazakh); its tooltips and «Last Seen / Jump Play»
      // resume prompt come from our messages for whatever `lang` the page passes.
      i18n: { [String(option.lang ?? 'en')]: playerStrings() },
      // No subtitle files: no subtitle menu (it would only offer a switch for nothing).
      settings:
        subtitle || subtitleEntries.length > 0
          ? [
              {
                width: 200,
                html: t('subtitles'),
                icon: captionsSVGString,
                selector: [
                  {
                    html: t('enableSubtitles'),
                    switch: true,
                    onSwitch: item => {
                      art.subtitle.show = !item.switch
                      return !item.switch
                    },
                  },
                  ...subtitleEntries,
                ],
                onSelect: item => {
                  art.subtitle.switch(item.url, {
                    name: item.html,
                  })
                  return item.html
                },
              },
            ]
          : [],
      // Only include subtitle config if a subtitle prop was provided to avoid requesting a non-existent default file
      ...(subtitle ? { subtitle } : {}),
    })

    instanceRef.current = art
    const handleMediaError = () => {
      if (isUnplayableMediaError(art.video.error)) setUnplayable(true)
    }
    art.video.addEventListener('error', handleMediaError)
    if (getInstance && typeof getInstance === 'function') {
      getInstance(art)
    }

    const handleReady = () => {
      if (startTime && art.duration >= startTime) {
        art.seek = startTime
      }
      if (onPlayerReady) {
        onPlayerReady(art)
      }
    }
    art.on('ready', handleReady)

    let handleTimeUpdate: (() => void) | undefined
    if (endTime) {
      handleTimeUpdate = () => {
        if (art.currentTime >= endTime) {
          art.pause()
          if (handleTimeUpdate) art.off('timeupdate', handleTimeUpdate)
        }
      }
      art.on('timeupdate', handleTimeUpdate)
    }

    return () => {
      art.video.removeEventListener('error', handleMediaError)
      art.off('ready', handleReady)
      if (handleTimeUpdate) {
        art.off('timeupdate', handleTimeUpdate)
      }
      if (!art.isDestroy) {
        art.destroy(false)
      }
    }
  })

  useEffect(() => {
    if (!artRef.current) return
    return createPlayer(artRef.current)
  }, [])

  if (missing) return <MediaUnavailable kind="video" />
  if (unplayable) return <MediaUnavailable kind="video" unplayable />
  return <div ref={artRef} {...rest} />
}

/**
 * Decode errors, and «format» errors from the demuxer itself (Chromium names
 * it in the message; Firefox reports NS_ERROR_DOM_MEDIA_*). A plain format
 * error with no such detail is also what a 404 or an offline fetch gives -
 * those keep the player's own reconnect / missing-file handling.
 */
export function isUnplayableMediaError(error: MediaError | null): boolean {
  if (!error) return false
  if (error.code === 3) return true // MEDIA_ERR_DECODE
  return (
    error.code === 4 && // MEDIA_ERR_SRC_NOT_SUPPORTED
    /DEMUXER|DECODER|PIPELINE_ERROR|NS_ERROR_DOM_MEDIA/i.test(error.message)
  )
}
