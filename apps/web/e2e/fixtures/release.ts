import { randomUUID } from 'node:crypto'
import type { APIRequestContext, APIResponse } from '@playwright/test'
import { test as base, expect } from './index'
import { apiAs } from './api'

type Created = { id: string; activity_id: string; status: string; policy?: Record<string, unknown> }
export async function body(response: APIResponse): Promise<Created> {
  expect(response.ok(), `${response.url()}: ${response.status()} ${await response.text()}`).toBe(true)
  const text = await response.text()
  return text ? (JSON.parse(text) as Created) : { id: '', activity_id: '', status: '' }
}

type ReleaseCourse = {
  id: string
  name: string
  activity: string
  assessment: string
  teacher: APIRequestContext
  student: APIRequestContext
}

export const test = base.extend<{ course: ReleaseCourse }>({
  course: async ({}, use) => {
    const teacher = await apiAs('teacher')
    const student = await apiAs('student')
    const name = `Release ${randomUUID().slice(0, 8)}`
    const course = await body(await teacher.post('courses', { data: { name } }))
    try {
      const chapter = await body(
        await teacher.post(`courses/${course.id}/chapters`, { data: { name: 'Release checks' } }),
      )
      const lesson = await body(
        await teacher.post(`chapters/${chapter.id}/activities`, {
          data: { name: 'Release lesson', activity_type: 'dynamic', activity_sub_type: 'dynamic_page' },
        }),
      )
      await body(await teacher.patch(`activities/${lesson.id}`, { data: { published: true } }))
      const quiz = await body(
        await teacher.post('assessments', {
          data: { chapter_id: chapter.id, kind: 'quiz', title: 'Release quiz' },
        }),
      )
      await body(
        await teacher.put(`assessments/${quiz.id}/policy`, {
          data: { ...quiz.policy, grade_release_mode: 'batch' },
        }),
      )
      await body(
        await teacher.post(`assessments/${quiz.id}/items`, {
          data: {
            title: 'Release question',
            max_score: 1,
            body: {
              kind: 'choice',
              variant: 'single_choice',
              prompt: 'Pick the correct answer.',
              options: [
                { id: 'correct', text: 'Correct answer', is_correct: true },
                { id: 'wrong', text: 'Wrong answer', is_correct: false },
              ],
            },
          },
        }),
      )
      await body(await teacher.post(`assessments/${quiz.id}/lifecycle`, { data: { to: 'published' } }))
      await body(await teacher.post(`courses/${course.id}/lifecycle`, { data: { action: 'publish' } }))
      await use({ id: course.id, name, activity: quiz.activity_id, assessment: quiz.id, teacher, student })
    } finally {
      expect(
        (await teacher.delete(`courses/${course.id}?acknowledge_learner_work=true`)).ok(),
        'remove release fixture',
      ).toBe(true)
      await teacher.dispose()
      await student.dispose()
    }
  },
})

export { expect }
