import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { CourseId } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { SubmitButton } from '#/shared/components/submit-button'
import { ConfirmDialog } from '#/shared/components/templates/confirm-dialog'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'
import { toast } from '#/shared/ui/toast'

import type { TagRow } from '../model/graph'
import { deleteTagOptions, updateTagOptions } from '../queries'

/**
 * One tag's decisions (B-CON-08): «Approve» / «Reject» (a rejected tag is kept, so the mapper does not suggest it
 * again) and «Remove» after a confirmation.
 */
export function TagActions({ courseId, tag }: { courseId: CourseId; tag: TagRow }) {
  const [removing, setRemoving] = useState(false)
  const update = useMutation(updateTagOptions(courseId))
  const remove = useMutation(deleteTagOptions(courseId))
  const path = { course_id: courseId, tag_id: tag.tag.id }
  const decide = (status: 'approved' | 'rejected') => update.mutate({ path, body: { status } })
  const activity = tag.activity ?? m.concepts_tag_activity_gone()
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {tag.status === 'approved' ? null : (
          <SubmitButton size="sm" variant="outline" pending={update.isPending} onClick={() => decide('approved')}>
            {m.concepts_approve()}
          </SubmitButton>
        )}
        {tag.status === 'rejected' ? null : (
          <SubmitButton size="sm" variant="outline" pending={update.isPending} onClick={() => decide('rejected')}>
            {m.concepts_reject()}
          </SubmitButton>
        )}
        <ConfirmDialog
          open={removing}
          onOpenChange={open => {
            setRemoving(open)
            if (!open) remove.reset()
          }}
          trigger={
            <Button size="sm" variant="ghost">
              {m.concepts_tag_remove()}
            </Button>
          }
          title={m.concepts_tag_remove_title({ activity })}
          consequence={m.concepts_tag_remove_consequence()}
          confirmLabel={m.concepts_tag_remove()}
          pending={remove.isPending}
          error={remove.error}
          onConfirm={() =>
            remove.mutate(
              { path },
              {
                onSuccess: () => {
                  setRemoving(false)
                  toast.add({ title: m.concepts_tag_removed() })
                },
              },
            )
          }
        />
      </div>
      {update.error ? <ErrorAlert>{presentError(update.error)}</ErrorAlert> : null}
    </div>
  )
}
