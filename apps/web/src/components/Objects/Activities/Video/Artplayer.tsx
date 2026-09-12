import type ArtplayerType from 'artplayer'
import { useEffect, useRef } from 'react'
import Artplayer from 'artplayer'
import { useTranslations } from 'next-intl'

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
  const t = useTranslations('Components.VideoPlayer')

  useEffect(() => {
    if (!artRef.current) return

    const art: ArtplayerType = new Artplayer({
      url: (option.url as string) || '',
      ...option,
      container: artRef.current,
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
      settings: [
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
      ],
      // Only include subtitle config if a subtitle prop was provided to avoid requesting a non-existent default file
      ...(subtitle ? { subtitle } : {}),
    })

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
      art.off('ready', handleReady)
      if (handleTimeUpdate) {
        art.off('timeupdate', handleTimeUpdate)
      }
      if (art?.destroy) {
        art.destroy(false)
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={artRef} {...rest} />
}
