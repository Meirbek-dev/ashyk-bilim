import { useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { hasCapability } from '#/shared/auth/access'
import { sessionOptions } from '#/shared/auth/session'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { ListPage } from '#/shared/components/templates/list-page'

import { searchBoxSchema } from '../model/admin'
import { CreateUserDialog } from './create-user-dialog'
import { UserSheet } from './user-sheet'
import { UsersFilters } from './users-filters'
import { UsersTable } from './users-table'

/**
 * One directory of every user (spec 5.4): search, order and filters in the URL, the selected user in a side panel
 * (`?user=`).
 */
export function UsersPage() {
  const search = useSearch({ from: '/_authed/admin/users' })
  const { q, user } = search
  const { data: session } = useSuspenseQuery(sessionOptions())
  const navigate = useNavigate()
  const form = useAppForm(searchBoxSchema, {
    defaultValues: { q: q ?? '' },
    onSubmit: ({ q: text }) =>
      navigate({ to: '/admin/users', search: { ...search, q: text.trim() || undefined, user: undefined } }),
  })
  return (
    <ListPage
      title={m.admin_users_title()}
      primaryAction={
        hasCapability(session, 'admin.users.create') ? (
          <CreateUserDialog withRoles={hasCapability(session, 'admin.roles')} />
        ) : null
      }
      search={
        <search className="w-full max-w-sm">
          <form
            onSubmit={event => {
              event.preventDefault()
              void form.handleSubmit()
            }}
          >
            <form.AppField name="q">
              {field => <field.TextField label={m.admin_users_search()} type="search" />}
            </form.AppField>
          </form>
        </search>
      }
      filters={<UsersFilters search={search} namedRoles={hasCapability(session, 'admin.roles')} />}
      activeFilters={(search.status ? 1 : 0) + (search.role ? 1 : 0)}
    >
      <UsersTable filter={search} namedRoles={hasCapability(session, 'admin.roles')} />
      {user ? <UserSheet key={user} id={user} /> : null}
    </ListPage>
  )
}
