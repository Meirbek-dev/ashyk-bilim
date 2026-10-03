import { m } from '#/paraglide/messages'
import { formatNumber } from '#/shared/i18n/format'
import { Link } from '#/shared/ui/link'

import { pageCount } from '../model/analytics'
import { PAGE_SIZE } from '../model/filters'

type PagerProps = {
  page: number
  total: number
  /** The search param that holds this table's page. */
  param?: 'page' | 'coursePage'
}

/** Numbered pages of an analytics table (NumberedPage, spec 7.6): the only pager of the app. One page, no pager. */
export function Pager({ page, total, param = 'page' }: PagerProps) {
  const count = pageCount(total, PAGE_SIZE)
  if (count <= 1) return null
  return (
    <nav aria-label={m.analytics_pager()} className="flex flex-wrap items-center gap-2 text-sm">
      {page > 1 ? (
        <Link variant="outline" to="." search={prev => ({ ...prev, [param]: page - 1 })}>
          {m.analytics_prev()}
        </Link>
      ) : null}
      <span className="text-muted-foreground tabular-nums">
        {m.analytics_page_of({ page: formatNumber(page), count: formatNumber(count) })}
      </span>
      {page < count ? (
        <Link variant="outline" to="." search={prev => ({ ...prev, [param]: page + 1 })}>
          {m.analytics_next()}
        </Link>
      ) : null}
    </nav>
  )
}
