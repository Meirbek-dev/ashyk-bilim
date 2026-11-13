import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import type { AssessmentImport } from '#/shared/api/gen/types.gen'
import { suggestConceptsMutation } from '#/shared/api/gen/@tanstack/react-query.gen'
import { useIdempotencyKey } from '#/shared/api/idempotency'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { presentError } from '#/shared/i18n/errors'
import { toast } from '#/shared/ui/toast'

import {
  commitBody,
  commitDefaults,
  commitFormSchema,
  commitHeaders,
  type CommitForm,
  type ImportDestination,
} from '../model/commit'
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
 * under one `Idempotency-Key`, then opens the test's builder with «Импортировано N вопросов». With «Предложить понятия»
 * it then queues the AI concept mapper (the new test's chapter; the whole course for an existing test): a refusal there
 * (AI off, hourly limit) is told, the questions stay imported.
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
  const suggest = useMutation(suggestConceptsMutation())
  const idempotency = useIdempotencyKey()
  const mapConcepts = async (value: CommitForm) => {
    try {
      await suggest.mutateAsync({
        path: { course_id: courseId },
        body: destination.into === 'new' ? { chapter_id: value.chapter_id } : {},
      })
      toast.add({ title: m.assessment_import_concepts_queued() })
    } catch (error) {
      toast.add({ title: m.assessment_import_concepts_failed({ reason: presentError(error) }) })
    }
  }
  const form = useAppForm<CommitForm>(commitFormSchema(destination, imported.items.length), {
    defaultValues: commitDefaults(imported, chapterId),
    onSubmit: value =>
      commit.mutateAsync(
        {
          path: { import_id: imported.id },
          body: commitBody(value, imported, destination),
          headers: commitHeaders(destination, idempotency.key),
        },
        {
          onSuccess: async done => {
            idempotency.settle()
            toast.add({ title: m.assessment_import_imported({ count: imported.items.length }) })
            if (value.map_concepts) await mapConcepts(value)
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
