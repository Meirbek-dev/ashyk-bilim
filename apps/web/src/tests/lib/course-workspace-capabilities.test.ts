// UX-258: the instructor role's `certificate:create:platform` opened the
// workspace of every course; course access comes from authorship or a
// platform grant the server honours for that stage.
import { describe, expect, it, vi } from 'vite-plus/test'

vi.mock('@/lib/auth/session', () => ({ requireSession: vi.fn() }))
vi.mock('@/i18n/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next-intl/server', () => ({ getLocale: vi.fn() }))
vi.mock('@services/courses/courses', () => ({ getCourseMetadata: vi.fn() }))

import { deriveCourseWorkspaceCapabilities } from '@/lib/course-management-server'

const session = (userId: string, permissions: string[]) =>
  ({ userId, permissions, roles: [] }) as unknown as Parameters<typeof deriveCourseWorkspaceCapabilities>[0]
const instructor = ['certificate:create:platform', 'assessment:grade:own', 'course:update:own', 'course:read:all']
const course = { creator_id: 'teacher-1', contributor_ids: ['helper-1'] } as unknown as AppCourse

describe('deriveCourseWorkspaceCapabilities', () => {
  it('refuses a pure instructor on another teacher’s course', () => {
    const caps = deriveCourseWorkspaceCapabilities(session('instructor-1', instructor), course)
    expect(caps.canViewWorkspace).toBe(false)
    expect(caps.canReviewCourse).toBe(false)
  })

  it('keeps the creator, an active contributor and a platform grader in', () => {
    expect(deriveCourseWorkspaceCapabilities(session('teacher-1', instructor), course).canViewWorkspace).toBe(true)
    expect(deriveCourseWorkspaceCapabilities(session('helper-1', []), course).canReviewCourse).toBe(true)
    const admin = deriveCourseWorkspaceCapabilities(session('admin-1', ['assessment:grade:platform']), course)
    expect(admin.canReviewCourse).toBe(true)
    expect(admin.canViewWorkspace).toBe(true)
  })
})
