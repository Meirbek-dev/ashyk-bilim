'use client'

import { useQueries } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useId } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { isApiError } from '@/lib/api/assertSuccess'
import { getCourseDeletionPreviewQueryOptions } from '@/lib/api/generated/courses/courses'
import { CourseDeletionPreview } from '@/lib/api/generated/zod'
import { stripEntityPrefix } from '@/hooks/courses/courseKeys'

export type LearnerWork = CourseDeletionPreview

const COUNT_ROWS = [
  ['learners', 'learners'],
  ['submissions', 'submissions'],
  ['file_attempts', 'fileAttempts'],
  ['certificates', 'certificates'],
] as const satisfies readonly (readonly [keyof LearnerWork, string])[]

export function hasLearnerWork(work: LearnerWork | null | undefined): work is LearnerWork {
  return Boolean(work && COUNT_ROWS.some(([field]) => work[field] > 0))
}

export function sumLearnerWork(works: readonly LearnerWork[]): LearnerWork {
  return works.reduce(
    (total, work) => ({
      learners: total.learners + work.learners,
      submissions: total.submissions + work.submissions,
      file_attempts: total.file_attempts + work.file_attempts,
      certificates: total.certificates + work.certificates,
    }),
    { learners: 0, submissions: 0, file_attempts: 0, certificates: 0 },
  )
}

/** The counts of a 409 `course-has-learner-work` (learner work arrived after the preview), else null. */
export function learnerWorkFromError(error: unknown): LearnerWork | null {
  if (!isApiError(error) || error.code !== 'course-has-learner-work') return null
  const parsed = CourseDeletionPreview.safeParse(error.details)
  // The code alone still means «acknowledge first», even without readable counts.
  return parsed.success ? parsed.data : { learners: 0, submissions: 0, file_attempts: 0, certificates: 0 }
}

/**
 * `GET /courses/{id}/deletion-preview` for every course while the confirm is open, summed. A failed preview
 * counts as «no known work»: the delete then answers 409 if there is some, and the dialog asks at that point.
 */
export function useCourseDeletionPreviews(courseUuids: readonly string[], enabled: boolean) {
  return useQueries({
    queries: courseUuids.map(courseUuid =>
      getCourseDeletionPreviewQueryOptions(stripEntityPrefix(courseUuid), {
        query: { enabled, staleTime: 0, retry: false },
      }),
    ),
    combine: results => ({
      isPending: enabled && results.some(result => result.isPending),
      learnerWork: sumLearnerWork(results.flatMap(result => (result.data ? [result.data] : []))),
    }),
  })
}

/** The learner-work warning and the required acknowledgement inside a course-delete confirm. */
export function CourseLearnerWorkWarning({
  learnerWork,
  acknowledged,
  onAcknowledgedChange,
  disabled,
}: {
  learnerWork: LearnerWork
  acknowledged: boolean
  onAcknowledgedChange: (acknowledged: boolean) => void
  disabled?: boolean
}) {
  const t = useTranslations('DashPage.CourseManagement.DeleteLearnerWork')
  const checkboxId = useId()
  const rows = COUNT_ROWS.filter(([field]) => learnerWork[field] > 0)

  return (
    <div className="space-y-3 text-left">
      <Alert variant="destructive">
        <AlertTitle>{t('title')}</AlertTitle>
        <AlertDescription>
          {rows.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5">
              {rows.map(([field, key]) => (
                <li key={field}>{t(key, { count: learnerWork[field] })}</li>
              ))}
            </ul>
          ) : null}
          <p>{t('archiveInstead')}</p>
        </AlertDescription>
      </Alert>
      <div className="flex items-start gap-2">
        <Checkbox
          id={checkboxId}
          checked={acknowledged}
          disabled={disabled}
          onCheckedChange={checked => onAcknowledgedChange(checked)}
          className="mt-0.5"
        />
        <Label htmlFor={checkboxId} className="text-sm leading-snug font-normal">
          {t('acknowledge')}
        </Label>
      </div>
    </div>
  )
}
