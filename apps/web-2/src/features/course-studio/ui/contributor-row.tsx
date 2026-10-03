import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'
import { toast } from 'sonner'

import { m } from '#/paraglide/messages'
import type { Contributor } from '#/shared/api/gen/types.gen'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'
import { ChoiceMenu } from '#/shared/ui/choice-menu'
import { Link } from '#/shared/ui/link'

import { ASSIGNABLE_ROLES, contributorRole } from '../model/studio'
import { updateContributorOptions } from '../queries'
import { RemoveContributor } from './remove-contributor'
import { roleLabels } from './role-labels'

type ContributorRowProps = { courseId: string; row: Contributor; manage: boolean }

/** One roster row: name, role (a menu for managers), and remove; an application row offers accept and reject. */
export function ContributorRow({ courseId, row, manage }: ContributorRowProps) {
  const update = useMutation(updateContributorOptions(useQueryClient(), courseId))
  const role = contributorRole(row.role)
  const applying = row.status === 'pending'
  const name = row.display_name || row.username
  const patch = (body: { role?: string; status?: string }, done: string) =>
    update.mutate({ path: { id: courseId, user_id: row.user_id }, body }, { onSuccess: () => toast(done) })
  const roleChoice = {
    label: m.studio_role_of({ name }),
    value: role,
    options: ASSIGNABLE_ROLES.map(value => ({ value, label: roleLabels[value]() })),
    onValueChange: (value: string) => patch({ role: value }, m.studio_role_saved()),
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
          <ChoiceMenu
            choice={roleChoice}
            trigger={
              <Button variant="outline" aria-label={roleChoice.label}>
                {roleLabels[role]()}
                <ChevronDown aria-hidden />
              </Button>
            }
          />
        ) : (
          <span className="text-sm text-muted-foreground">{roleLabels[role]()}</span>
        )}
        {manage && applying ? (
          <Button
            variant="secondary"
            pending={update.isPending}
            onClick={() => patch({ status: 'active' }, m.studio_application_accepted())}
          >
            {m.studio_application_accept()}
          </Button>
        ) : null}
        {manage && role !== 'creator' ? <RemoveContributor courseId={courseId} row={row} applying={applying} /> : null}
      </div>
      {update.error ? <p className="text-sm text-destructive">{presentError(update.error)}</p> : null}
    </div>
  )
}
