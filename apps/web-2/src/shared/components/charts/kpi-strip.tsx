import type { ReactNode } from 'react'

const columns = { 3: '@3xl:grid-cols-3', 4: '@3xl:grid-cols-4' }

type KpiStripProps = { label?: string; columns?: keyof typeof columns; children: ReactNode }

/** The row of `KpiTile`s a dashboard opens with: two to a row on a phone, three or four on a wide container. */
export function KpiStrip({ label, columns: count = 4, children }: KpiStripProps) {
  return (
    <section aria-label={label} className={`grid grid-cols-2 gap-x-gutter gap-y-6 ${columns[count]}`}>
      {children}
    </section>
  )
}
