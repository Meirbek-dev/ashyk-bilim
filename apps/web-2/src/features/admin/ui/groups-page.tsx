import { useSuspenseInfiniteQuery, useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { hasCapability } from '#/shared/auth/access'
import { sessionOptions } from '#/shared/auth/session'
import type { Usergroup } from '#/shared/api/gen/types.gen'
import type { DataColumn } from '#/shared/components/data-columns'
import { DataTable } from '#/shared/components/data-table'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { Link } from '#/shared/components/link'
import { ListState } from '#/shared/components/list-state'
import { ShowMore } from '#/shared/components/show-more'
import { ListPage } from '#/shared/components/templates/list-page'

import { groupsListOptions } from '../group-queries'
import { searchBoxSchema } from '../model/admin'
import { CreateGroupDialog } from './create-group-dialog'

const columns: DataColumn<Usergroup>[] = [
  {
    id: 'name',
    header: m.admin_field_name(),
    priority: 1,
    cell: group => (
      <span className="wrap-anywhere">
        <Link to="/teach/groups/$groupId" params={{ groupId: group.id }}>
          {group.name}
        </Link>
      </span>
    ),
  },
  {
    id: 'description',
    header: m.admin_field_description(),
    priority: 2,
    cell: group => (group.description ? <span className="wrap-anywhere">{group.description}</span> : null),
  },
  {
    id: 'members',
    header: m.admin_group_members(),
    priority: 2,
    cell: group => <span className="tabular-nums">{group.member_count}</span>,
  },
]

/**
 * User groups, newest first, "Show more" by keyset cursor, a name search in the URL (`?q=`); a group's members and edits
 * live on its page.
 */
export function GroupsPage() {
  const { q } = useSearch({ from: '/_authed/teach/groups/' })
  const navigate = useNavigate()
  const { data: session } = useSuspenseQuery(sessionOptions())
  const query = useSuspenseInfiniteQuery(groupsListOptions(q))
  const groups = query.data.pages.flatMap(page => page.items)
  const form = useAppForm(searchBoxSchema, {
    defaultValues: { q: q ?? '' },
    onSubmit: ({ q: text }) => navigate({ to: '/teach/groups', search: { q: text.trim() || undefined } }),
  })
  return (
    <ListPage
      title={m.admin_groups_title()}
      primaryAction={hasCapability(session, 'groups.create') ? <CreateGroupDialog /> : null}
      search={
        <search className="w-full max-w-md">
          <form
            onSubmit={event => {
              event.preventDefault()
              void form.handleSubmit()
            }}
          >
            <form.AppField name="q">
              {field => <field.TextField label={m.admin_groups_search()} type="search" />}
            </form.AppField>
          </form>
        </search>
      }
    >
      <ListState
        pending={false}
        error={query.error}
        count={groups.length}
        filtered={q !== undefined}
        onResetFilters={() => {
          form.reset({ q: '' })
          void navigate({ to: '/teach/groups', search: {} })
        }}
        emptyText={m.admin_groups_empty()}
        onRetry={() => void query.refetch()}
      >
        <DataTable label={m.admin_groups_table()} rows={groups} columns={columns} getKey={group => group.id} />
        <ShowMore
          hasMore={query.hasNextPage}
          pending={query.isFetchingNextPage}
          onMore={() => void query.fetchNextPage()}
        />
      </ListState>
    </ListPage>
  )
}
