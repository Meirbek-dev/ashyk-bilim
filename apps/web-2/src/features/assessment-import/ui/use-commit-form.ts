import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import type { AssessmentImport } from '#/shared/api/gen/types.gen'
import { useIdempotencyKey } from '#/shared/api/idempotency'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { toast } from '#/shared/ui/toast'

import { commitBody, commitDefaults, commitFormSchema, type CommitForm, type ImportDestination } from '../model/commit'
import { commitImportOptions } from '../queries'

type CommitFormOptions = {
  courseId: string
  imported: AssessmentImport
  destination: ImportDestination
  /** The chapter preselected for a new test. */
  chapterId: string | undefined
}

/**
 * The preview's form: row 1 of the file as editable settings; its submit creates the test (or loads the questions)
 * under one `Idempotency-Key`, then opens the test's builder with «Импортировано N вопросов».
 */
export function useCommitForm({ courseId, imported, destination, chapterId }: CommitFormOptions) {
  const navigate = useNavigate()
  const commit = useMutation(
    commitImportOptions(
      courseId,
      destination.into === 'test'
        ? { activityId: destination.activityId, assessmentId: destination.assessmentId }
        : undefined,
    ),
  )
  const idempotency = useIdempotencyKey()
  const form = useAppForm<CommitForm>(commitFormSchema(destination, imported.items.length), {
    defaultValues: commitDefaults(imported, chapterId),
    onSubmit: value =>
      commit.mutateAsync(
        {
          path: { import_id: imported.id },
          body: commitBody(value, imported, destination),
          headers: { 'Idempotency-Key': idempotency.key },
        },
        {
          onSuccess: done => {
            idempotency.settle()
            toast.add({ title: m.assessment_import_imported({ count: imported.items.length }) })
            if (done.result)
              void navigate({
                to: '/teach/courses/$courseId/activities/$activityId/edit',
                params: { courseId, activityId: done.result.activity_id },
              })
          },
          onError: error => idempotency.settle(error),
        },
      ),
  })
  return { form, commit }
}

export type CommitFormApi = ReturnType<typeof useCommitForm>['form']
