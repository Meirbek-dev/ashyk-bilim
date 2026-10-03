import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { Contributor } from '#/shared/api/gen/types.gen'
import { ConfirmDialog } from '#/shared/components/templates/confirm-dialog'
import { Button } from '#/shared/ui/button'
import { toast } from '#/shared/ui/toast'

import { removeContributorOptions } from '../people-queries'

type RemoveContributorProps = { courseId: string; row: Contributor; applying: boolean }

/** Remove someone from the team, or reject an application (the row is deleted either way), after a confirmation. */
export function RemoveContributor({ courseId, row, applying }: RemoveContributorProps) {
  const [open, setOpen] = useState(false)
  const remove = useMutation(removeContributorOptions(useQueryClient(), courseId))
  const name = row.display_name || row.username
  const texts = applying
    ? {
        verb: m.studio_application_reject(),
        title: m.studio_application_reject_title({ name }),
        consequence: m.studio_application_reject_consequence(),
        done: m.studio_application_rejected(),
      }
    : {
        verb: m.studio_team_remove(),
        title: m.studio_team_remove_title({ name }),
        consequence: m.studio_team_remove_consequence(),
        done: m.studio_team_removed(),
      }
  const confirm = () =>
    remove.mutate(
      { path: { course_id: courseId, user_id: row.user_id } },
      {
        onSuccess: () => {
          setOpen(false)
          toast.add({ title: texts.done })
        },
      },
    )
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={next => {
        setOpen(next)
        if (!next) remove.reset()
      }}
      trigger={<Button variant="outline">{texts.verb}</Button>}
      title={texts.title}
      consequence={texts.consequence}
      confirmLabel={texts.verb}
      onConfirm={confirm}
      pending={remove.isPending}
      error={remove.error}
    />
  )
}
