import { createAssessment, createItem } from '#/shared/api/gen/sdk.gen'
import type { AssessmentDetail, AssessmentKind, CreateItemRequest } from '#/shared/api/gen/types.gen'

import type { Seed } from '../fixtures/seed'
import { cookieOf, type Studio } from './course-studio-fixture'

// Assessments of the assessments*.spec.ts files, made through the generated SDK in a fresh course of the teacher
// (the course-studio fixture deletes it afterwards).

export const studioUrl = (courseId: string, activityId: string, tab = 'edit') =>
  `/teach/courses/${courseId}/activities/${activityId}/${tab}`

/** A single-choice question that passes readiness. */
export const readyChoice = (title: string): CreateItemRequest => ({
  title,
  max_score: 1,
  body: {
    kind: 'choice',
    variant: 'single_choice',
    multiple: false,
    prompt: 'Сколько будет 1 + 1?',
    explanation: null,
    options: [
      { id: 'a', text: '2', is_correct: true },
      { id: 'b', text: '3', is_correct: false },
    ],
  },
})

type MadeAssessment = { courseId: string; assessment: AssessmentDetail; headers: { cookie: string } }
type Options = { kind?: AssessmentKind; title?: string; items?: CreateItemRequest[]; published?: boolean }

export async function makeAssessment(studio: Studio, seed: Seed, options: Options = {}): Promise<MadeAssessment> {
  const { kind = 'quiz', title = 'Тест E2E', items = [], published = false } = options
  const made = await studio.course({
    chapters: [{ pages: published ? [{ published: true }] : [] }],
    publish: published,
  })
  const headers = cookieOf(seed, 'teacher')
  const chapterId = made.chapters[0]?.chapter.id ?? ''
  const { data: assessment } = await createAssessment({
    client: studio.api,
    body: { chapter_id: chapterId, kind, title },
    headers,
    throwOnError: true,
  })
  for (const body of items) {
    await createItem({ client: studio.api, path: { assessment_id: assessment.id }, body, headers, throwOnError: true })
  }
  return { courseId: made.course.id, assessment, headers }
}
