import type ArtplayerType from 'artplayer';
import { useEffect, useRef } from 'react';
import Artplayer from 'artplayer';

interface SubtitleEntry {
  html: string;
  url: string;
}

interface PlayerProps {
  option: any;
  getInstance?: (art: Artplayer) => void;
  subtitle?: any;
  subtitleEntries?: SubtitleEntry[];
  startTime?: number;
  endTime?: number | null;
  onPlayerReady?: (art: Artplayer) => void;
  [key: string]: any;
}
const captionsSVGString = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-captions-icon lucide-captions"><rect width="18" height="14" x="3" y="5" rx="2" ry="2" /><path d="M7 15h4M15 15h2M7 11h2M13 11h4" /></svg>`;

import ruRUMessages from '@/messages/ru-RU.json';
import kkKZMessages from '@/messages/kk-KZ.json';
import enUSMessages from '@/messages/en-US.json';

interface MessagesWithArtplayer {
  Artplayer?: Record<string, string>;
}

const getArtplayerSection = (messages: unknown): Record<string, string> | undefined => {
  return (messages as MessagesWithArtplayer).Artplayer;
};

function getArtplayerLocale(locale: string) {
  // Map incoming locale to the messages JSON we ship
  const map: Record<string, any> = {
    'en': getArtplayerSection(enUSMessages),
    'en-US': getArtplayerSection(enUSMessages),
    'kk': getArtplayerSection(kkKZMessages),
    'kk-KZ': getArtplayerSection(kkKZMessages),
    'ru': getArtplayerSection(ruRUMessages),
    'ru-RU': getArtplayerSection(ruRUMessages),
  };

  return map[locale] || undefined;
}

export default function ArtPlayer({
  option,
  getInstance,
  subtitle,
  locale = 'en',
  subtitleEntries = [],
  startTime,
  endTime,
  onPlayerReady,
  ...rest
}: PlayerProps) {
  const artRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const i18nLocale = getArtplayerLocale(locale);
    const art: ArtplayerType = new Artplayer({
      ...option,
      container: artRef.current,
      volume: 1,
      isLive: false,
      pip: option.pip,
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
      i18n: i18nLocale ? { [locale]: i18nLocale } : {},
      settings: [
        {
          width: 200,
          html: 'Субтитры',
          icon: captionsSVGString,
          selector: [
            {
              html: 'Включить',
              switch: true,
              onSwitch: (item) => {
                art.subtitle.show = !item.switch;
                return !item.switch;
              },
            },
            ...subtitleEntries,
          ],
          onSelect: (item) => {
            art.subtitle.switch(item.url, {
              name: item.html,
            });
            return item.html;
          },
        },
      ],
      // Only include subtitle config if a subtitle prop was provided to avoid requesting a non-existent default file
      ...(subtitle ? { subtitle } : {}),
    });

    if (getInstance && typeof getInstance === 'function') {
      getInstance(art);
    }

    const handleReady = () => {
      if (startTime && art.duration >= startTime) {
        art.seek = startTime;
      }
      if (onPlayerReady) {
        onPlayerReady(art);
      }
    };
    art.on('ready', handleReady);

    let handleTimeUpdate: (() => void) | undefined;
    if (endTime) {
      handleTimeUpdate = () => {
        if (art.currentTime >= endTime) {
          art.pause();
          if (handleTimeUpdate) art.off('timeupdate', handleTimeUpdate);
        }
      };
      art.on('timeupdate', handleTimeUpdate);
    }

    return () => {
      art.off('ready', handleReady);
      if (handleTimeUpdate) {
        art.off('timeupdate', handleTimeUpdate);
      }
      if (art?.destroy) {
        art.destroy(false);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={artRef}
      {...rest}
    />
  );
}
