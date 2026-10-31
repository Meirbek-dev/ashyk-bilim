import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { ConceptView, CourseId } from '#/shared/api/gen/types.gen'
import { ConfirmDialog } from '#/shared/components/templates/confirm-dialog'
import { Button } from '#/shared/ui/button'
import { toast } from '#/shared/ui/toast'

import { deleteOptions } from '../queries'

type DeleteConceptProps = { courseId: CourseId; concept: ConceptView; onDeleted: () => void }

/** «Delete» a concept after naming it (B-CON-06); its tags and prerequisites go with it, the sheet closes. */
export function DeleteConcept({ courseId, concept, onDeleted }: DeleteConceptProps) {
  const [open, setOpen] = useState(false)
  const remove = useMutation(deleteOptions(courseId))
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={next => {
        setOpen(next)
        if (!next) remove.reset()
      }}
      trigger={<Button variant="outline">{m.concepts_delete()}</Button>}
      title={m.concepts_delete_title({ name: concept.name })}
      consequence={m.concepts_delete_consequence()}
      confirmLabel={m.concepts_delete()}
      pending={remove.isPending}
      error={remove.error}
      onConfirm={() =>
        remove.mutate(
          { path: { course_id: courseId, concept_id: concept.id } },
          {
            onSuccess: () => {
              setOpen(false)
              toast.add({ title: m.concepts_deleted() })
              onDeleted()
            },
          },
        )
      }
    />
  )
}
