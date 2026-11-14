import type { ReactNode } from 'react'

const columns = { 3: '@3xl:grid-cols-3', 4: '@3xl:grid-cols-4' }

type KpiStripProps = { label?: string; columns?: keyof typeof columns; children: ReactNode }

/**
 * The row of `KpiTile`s a dashboard opens with: two to a row on a phone, three or four on a wide container. The tiles
 * lay their label, figure, change and action on the strip's rows (subgrid), so the space between two rows of tiles is
 * each tile's own bottom padding (taken back under the last row): a row gap would also open between a tile's lines.
 */
export function KpiStrip({ label, columns: count = 4, children }: KpiStripProps) {
  return (
    <section aria-label={label} className={`-mb-6 grid grid-cols-2 gap-x-gutter ${columns[count]}`}>
      {children}
    </section>
  )
}
