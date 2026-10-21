import { useMutation, useQueryClient } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { Curriculum } from '#/shared/api/gen/types.gen'
import { SubmitButton } from '#/shared/components/submit-button'
import { toast } from '#/shared/ui/toast'

import { publishLessonsOptions } from '../curriculum-queries'
import { draftLessons } from '../model/curriculum'
import { refusal } from './publish-switch'

/**
 * «Опубликовать уроки (N)» above the program (B-CST-51): every draft page, video and document at once instead of a
 * click per row; what could not go live is listed with the reason. Hidden when no lesson is a draft.
 */
export function PublishLessons({ courseId, curriculum }: { courseId: string; curriculum: Curriculum }) {
  const options = publishLessonsOptions(useQueryClient(), courseId)
  const publish = useMutation({
    ...options,
    onSuccess: result => {
      options.onSuccess(result)
      if (result.published.length > 0)
        toast.add({ title: m.studio_lessons_published({ count: result.published.length }) })
    },
  })
  // A lesson the last run could not publish (no video, link or document) is not offered again until it changes.
  const refused = new Set(publish.data?.refused.map(({ activity }) => `${activity.id}@${activity.version}`))
  const lessons = draftLessons(curriculum).filter(lesson => !refused.has(`${lesson.id}@${lesson.version}`))
  if (lessons.length < 2 && !publish.data?.refused.length) return null
  return (
    <div className="flex flex-col items-end gap-1">
      {lessons.length >= 2 ? (
        <SubmitButton variant="outline" pending={publish.isPending} onClick={() => publish.mutate(lessons)}>
          {m.studio_publish_lessons({ count: lessons.length })}
        </SubmitButton>
      ) : null}
      {publish.data?.refused.length ? (
        <ul role="alert" className="flex flex-col gap-1 text-sm text-destructive">
          {publish.data.refused.map(({ activity, error }) => (
            <li key={activity.id}>
              {activity.name}: {refusal(error, activity)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
