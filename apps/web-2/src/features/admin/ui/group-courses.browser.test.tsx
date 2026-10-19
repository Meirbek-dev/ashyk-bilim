import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Suspense } from 'react'
import { afterEach, describe, expect, test, vi } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import type { GroupCourse } from '#/shared/api/gen/types.gen'
import { renderInRouter } from '#/shared/components/testing'

import { GroupCourses } from './group-courses'

const group = { id: '0190a5d2-0000-7000-8000-000000000031' }

let next = 40
const course = (name: string, extra: Partial<GroupCourse> = {}): GroupCourse => ({
  id: `0190a5d2-0000-7000-8000-0000000000${(next++).toString()}`,
  name,
  published: true,
  archived: false,
  thumbnail_key: null,
  can_write: false,
  ...extra,
})

afterEach(() => vi.unstubAllGlobals())

async function show(courses: GroupCourse[]) {
  vi.stubGlobal('fetch', () => Promise.resolve(Response.json(courses)))
  return renderInRouter(
    <QueryClientProvider client={new QueryClient()}>
      <Suspense>
        <GroupCourses group={group} />
      </Suspense>
    </QueryClientProvider>,
  )
}

describe('GroupCourses', () => {
  test('B-ADM-18 the group page names its courses: a taught one opens its learners tab, a draft says so', async () => {
    const screen = await show([
      course('Blender', { can_write: true }),
      course('Черновик курса', { published: false }),
      course('Старый курс', { archived: true }),
    ])
    await expect
      .element(screen.getByRole('link', { name: 'Blender' }))
      .toHaveAttribute('href', expect.stringMatching(/\/teach\/courses\/[^/]+\/learners$/))
    await expect
      .element(screen.getByRole('link', { name: 'Черновик курса' }))
      .toHaveAttribute('href', expect.stringMatching(/^\/courses\/[^/]+$/))
    await expect.element(screen.getByText(m.admin_group_course_draft())).toBeVisible()
    await expect.element(screen.getByText(m.admin_group_course_archived())).toBeVisible()
  })

  test('B-ADM-18 a group in no course says where to enrol it', async () => {
    const screen = await show([])
    await expect.element(screen.getByText(m.admin_group_courses_empty())).toBeVisible()
  })
})
