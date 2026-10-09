/** @vitest-environment jsdom */
// COURSE_ARCHIVING.md section 11 (web): an archived course shows the archive
// badge alone, loses every edit flag, lists under `preset=archived`, and the
// confirm dialog names only the consequences that are non-zero.
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vite-plus/test'

import { CourseArchiveDialog } from '@/components/Dashboard/Courses/CourseArchiveDialog'
import { getCourseManagementContext, parsePreset } from '@/lib/course-management'
import { deriveCourseWorkspaceCapabilities } from '@/lib/course-management-server'
import ruMessages from '@/messages/ru-RU.json'

vi.mock('@/lib/auth/session', () => ({ requireSession: vi.fn() }))
vi.mock('@/i18n/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next-intl/server', () => ({ getLocale: vi.fn() }))
vi.mock('@services/courses/courses', () => ({ getCourseMetadata: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/hooks/useApiError', () => ({ useApiError: () => ({ toastApiError: vi.fn() }) }))
vi.mock('@services/courses/course-writes', () => ({ setCourseArchived: vi.fn() }))
vi.mock('@/lib/api/generated/courses/courses', () => ({
  useCourseArchivePreview: () => ({
    isPending: false,
    isError: false,
    data: {
      learners_enrolled: 42,
      learners_in_progress: 0,
      ungraded_submissions: 5,
      open_attempts: 0,
      scheduled_assessments: 1,
      public: true,
    },
  }),
}))

const archived = {
  course_uuid: 'c1',
  name: 'Курс',
  description: 'about',
  public: true,
  thumbnail_image: 'x.png',
  creator_id: 'teacher-1',
  contributor_ids: ['helper-1'],
  archived_at_unix: 1_700_000_000,
  chapters: [{ chapter_uuid: 'ch', activities: [{ activity_uuid: 'a' }] }],
} as unknown as AppCourse

const session = (userId: string, permissions: string[]) =>
  ({ userId, permissions, roles: [] }) as unknown as Parameters<typeof deriveCourseWorkspaceCapabilities>[0]

describe('course archiving (web)', () => {
  it('statusBadges: an archived course carries the archive badge alone', () => {
    expect(getCourseManagementContext(archived, 'row').statusBadges).toEqual(['archived'])
    // QA-D: visibility only - the list has no data to judge readiness by.
    expect(getCourseManagementContext({ ...archived, archived_at_unix: null }, 'row').statusBadges).toEqual(['public'])
  })

  it('deriveCourseWorkspaceCapabilities: archived turns every edit flag off, keeps the tabs readable', () => {
    const caps = deriveCourseWorkspaceCapabilities(session('teacher-1', []), archived)
    expect(caps.isArchived).toBe(true)
    expect(caps.canEditDetails).toBe(false)
    expect(caps.canEditCurriculum).toBe(false)
    expect(caps.canManageAccess).toBe(false)
    expect(caps.canManageCollaboration).toBe(false)
    expect(caps.canManageSettings).toBe(false)
    expect(caps.canManageCertificate).toBe(false)
    expect(caps.canReviewCourse).toBe(true)
    expect(caps.canArchiveCourse).toBe(true)
    expect(caps.canDeleteCourse).toBe(true)
    expect(caps.stages.details).toBe(true)
    expect(caps.stages.gradebook).toBe(true)

    const live = deriveCourseWorkspaceCapabilities(session('teacher-1', []), { ...archived, archived_at_unix: null })
    expect(live.isArchived).toBe(false)
    expect(live.canEditDetails).toBe(true)
  })

  it("parsePreset accepts 'archived'", () => {
    expect(parsePreset('archived')).toBe('archived')
    expect(parsePreset(['archived'])).toBe('archived')
    expect(parsePreset('nope')).toBe('all')
  })

  it('the archive dialog lists only the non-zero consequences', async () => {
    render(
      <NextIntlClientProvider locale="ru" messages={ruMessages} timeZone="UTC">
        <CourseArchiveDialog open onOpenChange={vi.fn()} courseUuid="c1" courseName="Курс" />
      </NextIntlClientProvider>,
    )
    const dialog = await screen.findByRole('alertdialog')
    const items = dialog.querySelectorAll('li')
    expect(items).toHaveLength(2)
    expect(items[0]?.textContent).toContain('5 работ не проверены')
    expect(items[1]?.textContent).toContain('1 запланированное задание')
    expect(dialog.textContent).not.toContain('учащ')
    expect(dialog.textContent).not.toContain('попыт')
    expect(dialog.textContent).toContain(ruMessages.DashPage.CourseManagement.Archive.summary)
  })
})
