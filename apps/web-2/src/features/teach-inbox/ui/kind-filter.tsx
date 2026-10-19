import { m } from '#/paraglide/messages'
import type { WorkKindCount } from '#/shared/api/gen/types.gen'
import { Link } from '#/shared/components/link'
import { formatNumber } from '#/shared/i18n/format'

import { INBOX_KINDS, type InboxSearch } from '../model/inbox'
import { kindMeta } from './inbox-columns'

/**
 * The kind filter as links (`?kind=`), keeping the course filter; each tab says how many items it holds (the server's
 * `kind_counts`, the course filter applied), «Все» their sum. An empty kind shows no number.
 */
export function KindFilter({ search, counts }: { search: InboxSearch; counts: readonly WorkKindCount[] | undefined }) {
  const countOf = (kind: (typeof INBOX_KINDS)[number] | undefined) =>
    kind === undefined
      ? (counts?.reduce((sum, row) => sum + row.count, 0) ?? 0)
      : (counts?.find(row => row.kind === kind)?.count ?? 0)
  const options = [
    { kind: undefined, label: m.inbox_filter_all() },
    ...INBOX_KINDS.map(kind => ({ kind, label: kindMeta[kind].label() })),
  ]
  return (
    <nav aria-label={m.inbox_state()} className="flex flex-wrap">
      {options.map(option => {
        const count = countOf(option.kind)
        return (
          <Link
            key={option.kind ?? 'all'}
            to="/teach"
            search={{ ...search, kind: option.kind }}
            activeOptions={{ exact: true, includeSearch: true }}
            variant="tab"
          >
            {option.label}
            {count > 0 ? <span className="ms-2 text-muted-foreground tabular-nums">{formatNumber(count)}</span> : null}
          </Link>
        )
      })}
    </nav>
  )
}
