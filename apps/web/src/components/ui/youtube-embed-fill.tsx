/**
 * Thin wrapper around @next/third-parties YouTubeEmbed that accepts
 * `style` as React.CSSProperties (standard JSX) instead of a raw string.
 * The web component underlying YouTubeEmbed expects a CSS string, so we
 * convert the CSSProperties object at the boundary here.
 */
import type { CSSProperties } from 'react'
import { YouTubeEmbed } from '@next/third-parties/google'
import { useTranslations } from 'next-intl'

type YouTubeEmbedProps = Parameters<typeof YouTubeEmbed>[0]

interface YouTubeEmbedFillProps extends Omit<YouTubeEmbedProps, 'style'> {
  style?: CSSProperties
}

function cssPropToString(style: CSSProperties): string {
  return Object.entries(style)
    .map(([key, value]) => {
      const property = key.replace(/([A-Z])/g, m => `-${m.toLowerCase()}`)
      return `${property}: ${value}`
    })
    .join('; ')
}

export function YouTubeEmbedFill({ style, ...props }: YouTubeEmbedFillProps) {
  const t = useTranslations('Common')
  // UX-119: lite-youtube's facade button/iframe title defaults to «Play».
  const embedProps: YouTubeEmbedProps = { playlabel: t('playVideo'), ...props }
  if (style) {
    embedProps.style = cssPropToString(style)
  }
  return <YouTubeEmbed {...embedProps} />
}
