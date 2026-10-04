import { m } from '#/paraglide/messages'
import { Link } from '#/shared/components/link'

import { INBOX_KINDS, type InboxSearch } from '../model/inbox'
import { kindMeta } from './inbox-columns'

/** The kind filter as links (`?kind=`), keeping the course filter. No counts: the server sends only the total. */
export function KindFilter({ search }: { search: InboxSearch }) {
  const options = [
    { kind: undefined, label: m.inbox_filter_all() },
    ...INBOX_KINDS.map(kind => ({ kind, label: kindMeta[kind].label() })),
  ]
  return (
    <nav aria-label={m.inbox_state()} className="flex flex-wrap">
      {options.map(option => (
        <Link
          key={option.kind ?? 'all'}
          to="/teach"
          search={{ ...search, kind: option.kind }}
          activeOptions={{ exact: true, includeSearch: true }}
          variant="tab"
        >
          {option.label}
        </Link>
      ))}
    </nav>
  )
}
