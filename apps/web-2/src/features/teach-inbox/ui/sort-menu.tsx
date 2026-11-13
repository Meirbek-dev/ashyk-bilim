import { useNavigate } from '@tanstack/react-router'
import { ArrowUpDown } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { ChoiceItems } from '#/shared/components/choice-items'
import { Button } from '#/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '#/shared/ui/dropdown-menu'

import { INBOX_SORTS, type InboxSort } from '../model/inbox'

const sortLabels = {
  priority: m.inbox_sort_priority,
  due: m.inbox_sort_due,
  oldest: m.inbox_sort_oldest,
  newest: m.inbox_sort_newest,
} satisfies Record<InboxSort, () => string>

const isInboxSort = (value: string): value is InboxSort => INBOX_SORTS.some(sort => sort === value)

/** The queue order, kept in the URL (`?sort=`) and applied by the server (B-INB-10); none = priority. */
export function SortMenu({ sort = 'priority' }: { sort: InboxSort | undefined }) {
  const navigate = useNavigate({ from: '/teach/' })
  const label = m.inbox_sort_label({ sort: sortLabels[sort]() })
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          // The icon says «order», the text which one (as the course list's): the full «Порядок: …» stays the name.
          <Button variant="outline" aria-label={label}>
            <ArrowUpDown aria-hidden data-icon="inline-start" className="text-muted-foreground" />
            <span className="inline-block first-letter:uppercase">{sortLabels[sort]()}</span>
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <ChoiceItems
          choice={{
            label,
            value: sort,
            options: INBOX_SORTS.map(value => ({ value, label: sortLabels[value]() })),
            onValueChange: value => {
              if (isInboxSort(value))
                void navigate({ search: prev => ({ ...prev, sort: value === 'priority' ? undefined : value }) })
            },
          }}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
