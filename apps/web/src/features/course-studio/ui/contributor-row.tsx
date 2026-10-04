import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { Contributor, UpdateContributorRequest } from '#/shared/api/gen/types.gen'
import { ChoiceItems } from '#/shared/components/choice-items'
import { Link } from '#/shared/components/link'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '#/shared/ui/dropdown-menu'
import { Spinner } from '#/shared/ui/spinner'
import { toast } from '#/shared/ui/toast'

import { ASSIGNABLE_ROLES, isAssignableRole } from '../model/studio'
import { updateContributorOptions } from '../people-queries'
import { RemoveContributor } from './remove-contributor'
import { roleLabels } from './role-labels'

type ContributorRowProps = { courseId: string; row: Contributor; manage: boolean }

/** One roster row: name, role (a menu for managers), and remove; an application row offers accept and reject. */
export function ContributorRow({ courseId, row, manage }: ContributorRowProps) {
  const update = useMutation(updateContributorOptions(useQueryClient(), courseId))
  const role = row.role
  const applying = row.status === 'pending'
  const name = row.display_name || row.username
  const patch = (body: UpdateContributorRequest, done: string) =>
    update.mutate(
      { path: { course_id: courseId, user_id: row.user_id }, body },
      { onSuccess: () => toast.add({ title: done }) },
    )
  const roleChoice = {
    label: m.studio_role_of({ name }),
    value: role,
    options: ASSIGNABLE_ROLES.map(value => ({ value, label: roleLabels[value]() })),
    onValueChange: (value: string) => {
      if (isAssignableRole(value)) patch({ role: value }, m.studio_role_saved())
    },
  }
  const changeable = manage && role !== 'creator' && !applying
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 wrap-anywhere">
          <Link to="/users/$username" params={{ username: row.username }}>
            {name}
          </Link>{' '}
          <span className="text-sm text-muted-foreground">@{row.username}</span>
        </p>
        {changeable ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" aria-label={roleChoice.label}>
                  {roleLabels[role]()}
                  <ChevronDown aria-hidden />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <ChoiceItems choice={roleChoice} />
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span className="text-sm text-muted-foreground">{roleLabels[role]()}</span>
        )}
        {manage && applying ? (
          <Button
            variant="secondary"

            onClick={() => patch({ status: 'active' }, m.studio_application_accepted())}
            disabled={update.isPending}
          >
            {update.isPending ? <Spinner data-icon="inline-start" /> : null}
            {m.studio_application_accept()}
          </Button>
        ) : null}
        {manage && role !== 'creator' ? <RemoveContributor courseId={courseId} row={row} applying={applying} /> : null}
      </div>
      {update.error ? <p className="text-sm text-destructive">{presentError(update.error)}</p> : null}
    </div>
  )
}
