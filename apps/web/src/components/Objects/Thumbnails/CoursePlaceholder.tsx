import { cn } from '@/lib/utils'

/** Stable hue for a course id, so each course keeps its own cover colour. */
export function coverHue(seed: string) {
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return hash % 360
}

/** Generated cover: a stable colour and the initials of the course title's words. */
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
  const abbreviation = (title.match(/[\p{L}\p{N}]+/gu) ?? [])
    .map(word => Array.from(word)[0])
    .join('')
    .toUpperCase()
  return (
    <div
      aria-hidden
      className={cn('@container absolute inset-0 flex items-center justify-center', className)}
      style={{
        background: `linear-gradient(135deg, oklch(0.58 0.13 ${hue}), oklch(0.38 0.11 ${(hue + 50) % 360}))`,
      }}
    >
      <span
        className="font-bold text-white/90 drop-shadow-sm"
        style={{ fontSize: `min(${compact ? '1.25rem' : '3.75rem'}, ${100 / Math.max(abbreviation.length, 1)}cqw)` }}
      >
        {abbreviation}
      </span>
    </div>
  )
}
