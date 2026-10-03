import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Suspense, useState } from 'react'

import { MarkdownView } from '#/features/markdown'
import { m } from '#/paraglide/messages'
import type { CourseUpdate } from '#/shared/api/gen/types.gen'
import { vCreateCourseUpdateRequest } from '#/shared/api/gen/valibot.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { SettingsSection } from '#/shared/components/templates/settings-section'
import { formatDate } from '#/shared/i18n/format'
import { Button } from '#/shared/ui/button'
import { Skeleton } from '#/shared/ui/skeleton'
import { toast } from '#/shared/ui/toast'

import { editUpdateOptions } from '../queries'
import { DeleteUpdate } from './delete-update'

type UpdateItemProps = { courseId: string; update: CourseUpdate; editable: boolean }

/** One announcement: read as the learner sees it, or edited in place (its own form and Save). */
export function UpdateItem({ courseId, update, editable }: UpdateItemProps) {
  const [editing, setEditing] = useState(false)
  const edit = useMutation(editUpdateOptions(useQueryClient(), courseId))
  const form = useAppForm(vCreateCourseUpdateRequest, {
    defaultValues: { title: update.title, content: update.content },
    onSubmit: body =>
      edit.mutateAsync(
        { path: { update_id: update.id }, body },
        {
          onSuccess: () => {
            setEditing(false)
            toast.add({ title: m.studio_saved() })
          },
        },
      ),
  })
  if (editing)
    return (
      <div className="flex flex-col gap-2">
        <SettingsSection
          title={update.title}
          description={formatDate(update.created_at_unix)}
          onSubmit={() => form.handleSubmit()}
          pending={edit.isPending}
          error={edit.error}
        >
          <form.AppField name="title">
            {field => <field.TextField label={m.studio_update_field_title()} required />}
          </form.AppField>
          <form.AppField name="content">
            {field => <field.TextareaField label={m.studio_update_field_content()} required />}
          </form.AppField>
        </SettingsSection>
        <div>
          <Button variant="ghost" onClick={() => setEditing(false)}>
            {m.ui_cancel()}
          </Button>
        </div>
      </div>
    )
  return (
    <article className="flex flex-col gap-2">
      <h3 className="text-lg font-semibold wrap-anywhere">{update.title}</h3>
      <p className="text-sm text-muted-foreground">{formatDate(update.created_at_unix)}</p>
      <Suspense fallback={<Skeleton className="h-4 w-2/3" />}>
        <MarkdownView content={update.content} />
      </Suspense>
      {editable ? (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            aria-label={m.studio_update_edit_named({ title: update.title })}
            onClick={() => setEditing(true)}
          >
            {m.studio_update_edit()}
          </Button>
          <DeleteUpdate courseId={courseId} update={update} />
        </div>
      ) : null}
    </article>
  )
}
