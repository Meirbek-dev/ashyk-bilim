import { useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { hasCapability } from '#/shared/auth/access'
import { sessionOptions } from '#/shared/auth/session'
import { useAppForm } from '#/shared/ui/form/use-app-form'
import { ListPage } from '#/shared/ui/templates/list-page'

import { searchBoxSchema } from '../model/admin'
import { CreateUserDialog } from './create-user-dialog'
import { UserSheet } from './user-sheet'
import { UsersTable } from './users-table'

/** One directory of every user (spec 5.4): search in the URL, the selected user in a side panel (`?user=`). */
export function UsersPage() {
  const { q, user } = useSearch({ from: '/_authed/admin/users' })
  const { data: session } = useSuspenseQuery(sessionOptions())
  const navigate = useNavigate()
  const form = useAppForm(searchBoxSchema, {
    defaultValues: { q: q ?? '' },
    onSubmit: ({ q: text }) => navigate({ to: '/admin/users', search: text.trim() ? { q: text.trim() } : {} }),
  })
  return (
    <ListPage
      title={m.admin_users_title()}
      primaryAction={<CreateUserDialog />}
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
    >
      <UsersTable q={q} namedRoles={hasCapability(session, 'admin.roles')} />
      {user ? <UserSheet key={user} username={user} /> : null}
    </ListPage>
  )
}
