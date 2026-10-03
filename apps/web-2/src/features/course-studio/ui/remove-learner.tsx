import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { CourseLearner } from '#/shared/api/gen/types.gen'
import { ConfirmDialog } from '#/shared/components/templates/confirm-dialog'
import { Button } from '#/shared/ui/button'
import { toast } from '#/shared/ui/toast'

import { removeLearnerOptions } from '../people-queries'

/** "Remove from course" after a confirmation: membership and progress go as if the learner left; submissions stay. */
export function RemoveLearner({ courseId, learner }: { courseId: string; learner: CourseLearner }) {
  const [open, setOpen] = useState(false)
  const remove = useMutation(removeLearnerOptions(useQueryClient(), courseId))
  const confirm = () =>
    remove.mutate(
      { path: { course_id: courseId, user_id: learner.user_id } },
      {
        onSuccess: () => {
          setOpen(false)
          toast.add({ title: m.studio_learner_removed() })
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
      trigger={<Button variant="outline">{m.studio_learner_remove()}</Button>}
      title={m.studio_learner_remove_title({ name: learner.display_name || learner.username })}
      consequence={m.studio_learner_remove_consequence()}
      confirmLabel={m.studio_learner_remove()}
      onConfirm={confirm}
      pending={remove.isPending}
      error={remove.error}
    />
  )
}
