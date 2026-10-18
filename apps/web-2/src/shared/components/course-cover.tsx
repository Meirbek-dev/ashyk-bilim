import { coverPattern } from './course-cover-pattern'

type CourseCoverProps = {
  /** The course id: the same course always gets the same ornament. */
  seed: string
  /** A storage key (`thumbnail_key`): the uploaded image wins over the ornament. */
  imageKey?: string | null
  /** A fixed chart slot (0..4) instead of the seed's: neighbours that must differ. */
  tone?: number
  /** The box it fills: a card or page picture (16:9, the shape of uploaded thumbnails, so their lettering survives), a
   * list thumbnail (16:9, coarser) or an upright panel (4:5). */
  shape?: keyof typeof shapes
  className?: string
}

// Width:height of the grid and its short side in tiles: a big panel takes more, smaller tiles.
const shapes = { card: [16 / 9, 6], thumb: [16 / 9, 3], panel: [0.8, 10] } as const

// Full class names per chart slot (Tailwind reads them literally): the field tint, the ornament ink and the studs,
// which take a neighbouring colour like the contrasting stitches on felt (lapis on turquoise, madder on saffron...).
const inks = [
  { field: 'fill-chart-1/15', line: 'stroke-chart-1', stud: 'fill-chart-3' },
  { field: 'fill-chart-2/15', line: 'stroke-chart-2', stud: 'fill-chart-1' },
  { field: 'fill-chart-3/20', line: 'stroke-chart-3', stud: 'fill-chart-4' },
  { field: 'fill-chart-4/15', line: 'stroke-chart-4', stud: 'fill-chart-3' },
  { field: 'fill-chart-5/20', line: 'stroke-chart-5', stud: 'fill-chart-2' },
] as const

/**
 * A course's picture: its uploaded thumbnail, else an ornament generated from its id: Truchet arcs in one chart
 * colour on a tint of it, like the stitched felt of a syrmak rug. Decorative: the course name is always beside it.
 */
export function CourseCover({ seed, imageKey, tone, shape = 'card', className = '' }: CourseCoverProps) {
  if (imageKey)
    return <img src={`/content/${imageKey}`} alt="" loading="lazy" className={`bg-muted object-cover ${className}`} />
  const { cols, rows, field, path, studs } = coverPattern(seed, ...shapes[shape])
  const ink = inks[(tone ?? field) % inks.length] ?? inks[0]
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${cols} ${rows}`}
      preserveAspectRatio="xMidYMid slice"
      className={`bg-card ${className}`}
    >
      <rect width={cols} height={rows} className={ink.field} />
      <path d={path} className={`fill-none ${ink.line}`} strokeWidth={0.13} strokeLinecap="round" />
      {studs.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={0.16} className={ink.stud} />
      ))}
    </svg>
  )
}
