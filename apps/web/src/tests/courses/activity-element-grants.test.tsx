/** @vitest-environment jsdom */

import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'

// v2 `Activity` carries no `can_update` / `can_delete`; the curriculum row
// derives them from the session grants + course `creator_id` like the course
// workspace does. Before this, the creator saw no rename / publish / delete
// controls on any activity.

const harness = vi.hoisted(() => ({
  permissions: new Set<string>(),
  userId: 'teacher-1',
  creatorId: 'teacher-1',
}))

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/hooks/useSession', () => ({
  useSession: () => ({
    can: (resource: string, action: string, scope: string) => harness.permissions.has(`${resource}:${action}:${scope}`),
    session: { userId: harness.userId },
  }),
}))
vi.mock('@components/Contexts/CourseContext', () => ({
  useCourse: () => ({ courseStructure: { course_uuid: 'course-1', creator_id: harness.creatorId } }),
}))
vi.mock('@/hooks/mutations/useActivityMutations', () => ({
  useActivityMutations: () => ({ deleteActivity: vi.fn(), updateActivity: vi.fn() }),
}))
vi.mock('@/components/Objects/Elements/Tooltip/Tooltip', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('@services/config/config', () => ({ getAbsoluteUrl: (path: string) => path }))

import ActivityElement from '@/components/Dashboard/Pages/Course/EditCourseStructure/DraggableElements/ActivityElement'

const activity = {
  id: 'act-1',
  activity_uuid: 'act-1',
  activity_type: 'TYPE_DYNAMIC' as const,
  name: 'Introduction Lecture',
  published: false,
}

const renderRow = () => render(<ActivityElement activity={activity} activityIndex={0} course_uuid="course-1" />)

describe('ActivityElement capabilities (v2 grants)', () => {
  it('lets the course creator with `:own` grants rename, publish and delete', () => {
    harness.permissions = new Set(['activity:update:own', 'activity:delete:own'])
    harness.creatorId = 'teacher-1'
    renderRow()
    expect(screen.getByRole('button', { name: 'editButton' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'publish' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'deleteButton' })).toBeInTheDocument()
  })

  it('hides them for a non-creator holding only `:own` grants', () => {
    harness.permissions = new Set(['activity:update:own', 'activity:delete:own'])
    harness.creatorId = 'someone-else'
    renderRow()
    expect(screen.queryByRole('button', { name: 'editButton' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'publish' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'deleteButton' })).toBeNull()
  })

  it('platform-scoped grants apply to any course', () => {
    harness.permissions = new Set(['activity:update:platform'])
    harness.creatorId = 'someone-else'
    renderRow()
    expect(screen.getByRole('button', { name: 'publish' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'deleteButton' })).toBeNull()
  })
})
