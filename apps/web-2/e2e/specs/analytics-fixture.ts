import { createClient, createConfig } from '#/shared/api/gen/client'
import { atRiskLearners, createAssessment, createItem, enrollCourseLearners, lifecycle } from '#/shared/api/gen/sdk.gen'

import type { Seed } from '../fixtures/seed'
import { readyChoice } from './assessments-fixture'
import { expect, test as base } from './course-studio-fixture'

export { expect } from './course-studio-fixture'
export const cookie = (seed: Seed, role: 'teacher' | 'admin') => {
  const { name, value } = seed.accounts[role].cookie
  return { cookie: `${name}=${value}` }
}

export const test = base.extend<{ api: ReturnType<typeof createClient>; riskCourse: string }>({
  api: async ({ baseURL }, use) => use(createClient(createConfig({ baseUrl: String(baseURL) }))),
  riskCourse: async ({ studio, seed }, use) => {
    const made = await studio.course({ chapters: [{ pages: [{ published: true }] }], publish: true })
    const headers = cookie(seed, 'teacher')
    const chapterId = made.chapters[0]?.chapter.id ?? ''
    // Zero progress (30) plus two missing exams (12) makes a medium-risk learner, independent of seed history.
    for (const title of ['First required exam', 'Second required exam']) {
      const { data } = await createAssessment({
        client: studio.api,
        headers,
        body: { chapter_id: chapterId, kind: 'exam', title },
        throwOnError: true,
      })
      const path = { assessment_id: data.id }
      await createItem({ client: studio.api, headers, path, body: readyChoice(title), throwOnError: true })
      await lifecycle({ client: studio.api, headers, path, body: { to: 'published' }, throwOnError: true })
    }
    await enrollCourseLearners({
      client: studio.api,
      headers,
      path: { course_id: made.course.id },
      body: { identifiers: ['e2e-student1'] },
      throwOnError: true,
    })
    const { data } = await atRiskLearners({
      client: studio.api,
      headers,
      query: { course_ids: made.course.id },
      throwOnError: true,
    })
    expect(data.items).toEqual([
      expect.objectContaining({
        user_id: seed.accounts.student.session.user_id,
        risk_level: 'medium',
        missing_required_assessments: 2,
      }),
    ])
    await use(made.course.id)
  },
})
