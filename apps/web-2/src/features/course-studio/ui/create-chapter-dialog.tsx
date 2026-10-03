import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { CreateChapterRequest } from '#/shared/api/gen/types.gen'
import { vCreateChapterRequest } from '#/shared/api/gen/valibot.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { FormDialog } from '#/shared/components/templates/form-dialog'
import { Button } from '#/shared/ui/button'
import { toast } from '#/shared/ui/toast'

import { createChapterOptions } from '../curriculum-queries'

const defaultValues: CreateChapterRequest = { name: '' }

/** "New chapter": a name; the chapter is appended last and shows at once (the answer goes into the cache). */
export function CreateChapterDialog({ courseId }: { courseId: string }) {
  const [open, setOpen] = useState(false)
  const create = useMutation(createChapterOptions(useQueryClient(), courseId))
  const form = useAppForm(vCreateChapterRequest, {
    defaultValues,
    onSubmit: body =>
      create.mutateAsync(
        { path: { course_id: courseId }, body },
        {
          onSuccess: () => {
            changeOpen(false)
            toast.add({ title: m.studio_chapter_created() })
          },
        },
      ),
  })
  function changeOpen(next: boolean) {
    setOpen(next)
    if (!next) {
      form.reset()
      create.reset()
    }
  }
  return (
    <FormDialog
      open={open}
      onOpenChange={changeOpen}
      trigger={<Button>{m.studio_chapter_new()}</Button>}
      title={m.studio_chapter_new()}
      submitLabel={m.studio_create_submit()}
      onSubmit={() => form.handleSubmit()}
      pending={create.isPending}
      error={create.error}
    >
      <form.AppField name="name">{field => <field.TextField label={m.studio_field_name()} required />}</form.AppField>
    </FormDialog>
  )
}
