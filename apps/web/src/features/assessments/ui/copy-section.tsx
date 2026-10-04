import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import * as v from 'valibot'

import { m } from '#/paraglide/messages'
import type { AssessmentDetail } from '#/shared/api/gen/types.gen'
import { vDuplicateRequest } from '#/shared/api/gen/valibot.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { FormDialog } from '#/shared/components/templates/form-dialog'
import { Button } from '#/shared/ui/button'
import { toast } from '#/shared/ui/toast'

import { duplicateOptions } from '../queries'

/** The copy needs a title: the contract's own rule (1..500), required here. */
const copySchema = v.object({ title: vDuplicateRequest.entries.title.wrapped })

/** "Copy": a draft with the same questions and rules in the same chapter; its studio opens after. */
export function CopySection({ title, assessment }: { title: string; assessment: AssessmentDetail }) {
  const navigate = useNavigate()
  const duplicate = useMutation(duplicateOptions(assessment.course_id))
  const [open, setOpen] = useState(false)
  const form = useAppForm(copySchema, {
    defaultValues: { title: m.assessments_item_copy_title({ title }) },
    onSubmit: body =>
      duplicate.mutateAsync(
        { path: { assessment_id: assessment.id }, body },
        {
          onSuccess: copy => {
            setOpen(false)
            toast.add({ title: m.assessments_copied() })
            void navigate({
              to: '/teach/courses/$courseId/activities/$activityId/edit',
              params: { courseId: copy.course_id, activityId: copy.activity_id },
            })
          },
        },
      ),
  })
  return (
    <section aria-labelledby="copy-title" className="flex max-w-prose flex-col items-start gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="copy-title" className="text-xl font-semibold">
          {m.assessments_nav_copy()}
        </h2>
        <p className="text-sm text-muted-foreground">{m.assessments_copy_hint()}</p>
      </div>
      <FormDialog
        open={open}
        onOpenChange={next => {
          setOpen(next)
          if (!next) duplicate.reset()
        }}
        trigger={<Button variant="outline">{m.assessments_copy()}</Button>}
        title={m.assessments_copy()}
        submitLabel={m.assessments_copy()}
        onSubmit={() => form.handleSubmit()}
        pending={duplicate.isPending}
        error={duplicate.error}
      >
        <form.AppField name="title">
          {field => <field.TextField label={m.assessments_copy_field()} required />}
        </form.AppField>
      </FormDialog>
    </section>
  )
}
