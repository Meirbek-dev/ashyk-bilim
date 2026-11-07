import { cn } from '#/shared/lib/utils'

const columns = { 3: '@lg:grid-cols-3', 5: '@lg:grid-cols-5' }

type AdminNumbersProps = {
  items: readonly { key: string; label: string; value: string }[]
  columns: keyof typeof columns
}

/**
 * A few counts of one kind. Wide: one row of numerals, each over its label under one rule. On a phone a short ledger
 * (label left, numeral right, hairlines between), so an odd count leaves no gap in a two-column grid.
 */
export function AdminNumbers({ items, columns: count }: AdminNumbersProps) {
  return (
    <div className="@container">
      <dl
        className={cn(
          'flex flex-col divide-y border-y @lg:grid @lg:gap-x-gutter @lg:divide-y-0 @lg:border-y-0',
          columns[count],
        )}
      >
        {items.map(item => (
          <div
            key={item.key}
            className="flex items-baseline justify-between gap-4 py-1.5 @lg:flex-col @lg:justify-start @lg:gap-1 @lg:border-t @lg:pt-2 @lg:pb-0"
          >
            <dt className="text-sm text-muted-foreground">{item.label}</dt>
            <dd className="font-heading text-xl font-semibold tabular-nums">{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
