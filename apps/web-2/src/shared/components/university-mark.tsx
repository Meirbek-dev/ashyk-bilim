import { cn } from 'cn'

import { m } from '#/paraglide/messages'

// Cut from the brand masters (noplagiat apps/web/brand) and re-inked: AVIF first, WebP for the rest.
const files = {
  lockup: { name: 'tou-lockup', width: 436, height: 144 },
  emblem: { name: 'tou-emblem', width: 121, height: 192 },
} as const

/**
 * The Toraighyrov University mark, the platform's owner: the lockup (emblem + wordmark) or the emblem alone. `auto`
 * follows the color mode before hydration like BrandMark (navy by day, white at night; the hidden one is out of the
 * accessibility tree, so the name is read once); `white` is for the brand panel.
 */
export function UniversityMark({
  kind = 'lockup',
  ink = 'auto',
  className = 'h-8',
}: {
  kind?: keyof typeof files
  ink?: 'auto' | 'white'
  className?: string
}) {
  const { name, width, height } = files[kind]
  const inks =
    ink === 'white'
      ? [['-white', '']]
      : [
          ['', 'brand-mark-day'],
          ['-white', 'brand-mark-night'],
        ]
  return (
    <span className={cn('brand-mark inline-flex shrink-0', className)}>
      {inks.map(([suffix, mode]) => (
        <picture key={suffix} className={cn('h-full', mode)}>
          <source type="image/avif" srcSet={`/brand/${name}${suffix}.avif`} />
          <img
            src={`/brand/${name}${suffix}.webp`}
            alt={m.platform_university()}
            width={width}
            height={height}
            className="h-full w-auto"
          />
        </picture>
      ))}
    </span>
  )
}
