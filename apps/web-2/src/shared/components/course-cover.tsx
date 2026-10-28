import { useId, useState } from 'react'

import { EMBLEM } from './brand-emblem'
import { COVER_TONES, coverLayout, type CoverShape } from './course-cover-layout'

type CourseCoverProps = {
  /** The course id: the same course always gets the same cover. */
  seed: string
  /** A storage key (`thumbnail_key`): the uploaded image wins over the generated cover. */
  imageKey?: string | null
  /** A fixed brand tone (0 navy, 1 orange, 2 blue, 3 sand, 4 midnight) instead of the seed's. */
  tone?: number
  /** The box it fills: a card or page picture (16:9, the shape of uploaded thumbnails, so their lettering survives), a
   * list thumbnail (16:9, the whole emblem) or an upright panel (4:5). */
  shape?: CoverShape
  className?: string
}

/**
 * A course's picture: its uploaded thumbnail, else a brand cover from its id: one of the brand tones with the
 * Ashyq Bilim emblem drawn large in a hairline, cropped differently per course. Decorative: the course name is always
 * beside it. A picture that fails to load (a file gone from storage) gives way to the cover, not an empty grey box.
 */
export function CourseCover({ seed, imageKey, tone, shape = 'card', className = '' }: CourseCoverProps) {
  const [broken, setBroken] = useState<string | null>(null)
  // Gradient ids must be unique on the page and valid inside url(#...): React's ids carry other characters.
  const id = `cover${useId().replace(/[^\w-]/g, '')}`
  if (imageKey && broken !== imageKey)
    return (
      <img
        src={`/content/${imageKey}`}
        alt=""
        loading="lazy"
        onError={() => setBroken(imageKey)}
        className={`bg-muted object-cover ${className}`}
      />
    )
  const layout = coverLayout(seed, shape)
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      preserveAspectRatio="xMidYMid slice"
      data-tone={(tone ?? layout.tone) % COVER_TONES}
      className={`ab-cover ${className}`}
    >
      <defs>
        <linearGradient id={`${id}-field`} x1="0" y1="0" x2="1" y2="1">
          <stop className="ab-cover-from" />
          <stop offset="1" className="ab-cover-to" />
        </linearGradient>
        <radialGradient id={`${id}-light`} cx="0" cy="0" r="1">
          <stop className="ab-cover-light" />
          <stop offset="1" className="ab-cover-light" />
        </radialGradient>
      </defs>
      <rect width={layout.width} height={layout.height} fill={`url(#${id}-field)`} />
      <rect width={layout.width} height={layout.height} fill={`url(#${id}-light)`} />
      <path d={EMBLEM.path} transform={layout.transform} className="ab-cover-ink" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
