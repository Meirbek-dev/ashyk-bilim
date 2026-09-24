/** @vitest-environment jsdom */
// UX-168: the dash table row «Удалить» opens the same confirm as the course
// card — nothing is deleted until the dialog's action is clicked.
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vite-plus/test'

import { CourseRowActions } from '@/app/_shared/dash/courses/client'
import ruMessages from '@/messages/ru-RU.json'
import { deleteCourseFromBackend } from '@services/courses/course-delete'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/dash/courses',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/i18n/navigation', () => ({ Link: (props: React.ComponentProps<'a'>) => <a {...props} /> }))
vi.mock('@services/media/media', () => ({ getCourseThumbnailMediaDirectory: () => '' }))
vi.mock('@services/config/config', () => ({ getAbsoluteUrl: (p: string) => p, getSiteUrl: () => '' }))
vi.mock('@/hooks/useSession', () => ({
  useSession: () => ({ user: { id: 'me' }, can: () => true }),
}))
vi.mock('@/features/trail/hooks/useTrail', () => ({ useTrailCurrent: () => ({ data: undefined }) }))
vi.mock('@services/courses/course-delete', () => ({ deleteCourseFromBackend: vi.fn(async () => {}) }))

describe('UX-168 dash row delete', () => {
  it('asks before deleting, then deletes on confirm', async () => {
    const onOptimisticDelete = vi.fn()
    render(
      <NextIntlClientProvider locale="ru" messages={ruMessages} timeZone="UTC">
        <CourseRowActions
          course={{ course_uuid: 'c1', name: 'Курс', creator_id: 'me' }}
          onOptimisticDelete={onOptimisticDelete}
        />
      </NextIntlClientProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: ruMessages.DashPage.CourseManagement.Dashboard.rowActions.menuLabel }))
    fireEvent.click(await screen.findByText(ruMessages.DashPage.CourseManagement.Dashboard.rowActions.delete))
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
    expect(deleteCourseFromBackend).not.toHaveBeenCalled()
    expect(onOptimisticDelete).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText(ruMessages.Components.CourseThumbnail.deleteButtonText))
    await waitFor(() => expect(deleteCourseFromBackend).toHaveBeenCalledWith('c1'))
    expect(onOptimisticDelete).toHaveBeenCalledWith(['c1'])
  })
})
