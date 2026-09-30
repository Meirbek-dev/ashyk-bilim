import { cn } from '@/lib/utils'

/** Stable hue for a course id, so each course keeps its own cover colour. */
export function coverHue(seed: string) {
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return hash % 360
}

/**
 * Generated cover for a course without a thumbnail: a gradient picked from the id and the
 * title's first letter — a grid of identical logo placeholders told courses apart by nothing.
 * (The title itself sits right under the cover, so it is not repeated here.)
 */
export default function CoursePlaceholder({
  seed,
  title,
  compact = false,
  className,
}: {
  seed: string
  title: string
  compact?: boolean
  className?: string
}) {
  const hue = coverHue(seed)
  return (
    <div
      aria-hidden
      className={cn('absolute inset-0 flex items-center justify-center', className)}
      style={{
        background: `linear-gradient(135deg, oklch(0.58 0.13 ${hue}), oklch(0.38 0.11 ${(hue + 50) % 360}))`,
      }}
    >
      <span className={cn('font-bold text-white/90 drop-shadow-sm', compact ? 'text-xl' : 'text-6xl')}>
        {title.trim().charAt(0).toUpperCase()}
      </span>
    </div>
  )
}
