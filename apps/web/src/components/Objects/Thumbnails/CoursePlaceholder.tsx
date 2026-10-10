import { cn } from '@/lib/utils'

const coverColors = ['#e2e8ee', '#e2e9e1', '#eee6da', '#e8e3ed', '#dde9ec']

/** Stable palette choice so each course keeps its own cover colour. */
function coverColor(seed: string) {
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return coverColors[hash % coverColors.length]
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
  const abbreviation = (title.match(/[\p{L}\p{N}]+/gu) ?? [])
    .map(word => Array.from(word)[0])
    .join('')
    .toUpperCase()
  return (
    <div
      aria-hidden
      className={cn('@container absolute inset-0 flex items-center justify-center', className)}
      style={{
        backgroundColor: coverColor(seed),
        color: '#334155',
      }}
    >
      <span
        className="font-bold"
        style={{ fontSize: `min(${compact ? '1.25rem' : '3.75rem'}, ${100 / Math.max(abbreviation.length, 1)}cqw)` }}
      >
        {abbreviation}
      </span>
    </div>
  )
}
