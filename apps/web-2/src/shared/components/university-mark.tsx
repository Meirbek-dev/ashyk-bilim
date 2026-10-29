import { cn } from 'cn'

import { m } from '#/paraglide/messages'

// Traced from the brand masters (noplagiat apps/web/brand) into one path per file, so the small wordmark of the top bar
// stays sharp at any size and density (a downscaled raster blurred it).
const files = {
  lockup: { name: 'tou-lockup', width: 1517, height: 501 },
  emblem: { name: 'tou-emblem', width: 717, height: 1140 },
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
        <img
          key={suffix}
          src={`/brand/${name}${suffix}.svg`}
          alt={m.platform_university()}
          width={width}
          height={height}
          className={cn('h-full w-auto', mode)}
        />
      ))}
    </span>
  )
}
