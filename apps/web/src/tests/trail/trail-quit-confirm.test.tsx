/** @vitest-environment jsdom */
// Gauntlet F08/F17: «Покинуть курс» destroyed progress on a bare click with no
// toast; the certificate control said «Скачать» but only opened the verify page.
import { describe, expect, it, vi } from 'vite-plus/test'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { toast } from 'sonner'
import TrailCourseElement from '@components/Pages/Trail/TrailCourseElement'
import { removeCourse } from '@services/courses/activity'
import ruMessages from '@/messages/ru-RU.json'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/i18n/navigation', () => ({ Link: (props: React.ComponentProps<'a'>) => <a {...props} /> }))
vi.mock('@/features/certifications/hooks/useCertifications', () => ({
  useUserCertificateByCourse: () => ({
    data: { data: [{ certificate_user: { user_certification_uuid: 'CODE-1' } }] },
    isPending: false,
  }),
}))
vi.mock('@services/courses/activity', () => ({ removeCourse: vi.fn(async () => undefined) }))
vi.mock('@/lib/cache/revalidate', () => ({ revalidateTags: vi.fn(async () => undefined) }))
vi.mock('@services/media/media', () => ({ getCourseThumbnailMediaDirectory: () => '' }))
vi.mock('@services/config/config', () => ({
  getAbsoluteUrl: (p: string) => p,
  getSiteUrl: () => 'http://localhost:3000',
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const courseId = '01a0910d-2963-7483-a97d-40dc56e9aa20'

function renderCard() {
  const queryClient = new QueryClient()
  queryClient.setQueryData(['learner-course', courseId, 'state'], {
    outline: [{ id: 'c1', index: 0, title: 'x', activities: [{ id: 'a1', complete: true, activity_type: 'quiz' }] }],
  })
  render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="ru" messages={ruMessages} timeZone="UTC">
        <TrailCourseElement
          course={{ course_uuid: courseId, name: 'Основы Python' } as AppCourse}
          run={{ course_total_steps: 1, steps: [] } as unknown as AppTrailRun}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  )
  return queryClient
}

describe('TrailCourseElement quit + certificate', () => {
  it('asks for confirmation, unenrols only on confirm and toasts', async () => {
    const queryClient = renderCard()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    fireEvent.click(screen.getByRole('button', { name: 'Покинуть курс' }))
    expect(removeCourse).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Покинуть курс «Основы Python»?')
    fireEvent.click(screen.getByRole('button', { name: 'Остаться' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(removeCourse).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Покинуть курс' }))
    const confirm = (await screen.findAllByRole('button', { name: 'Покинуть курс' })).at(-1)!
    fireEvent.click(confirm)
    await waitFor(() => expect(removeCourse).toHaveBeenCalledWith(courseId))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Вы покинули курс «Основы Python»'))
    // The card goes with the toast: the trail query is dropped before it fires (UX-081).
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['trail', 'current'] })
    expect(invalidate.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(toast.success).mock.invocationCallOrder[0]!)
  })

  it('drops the stale card when leaving fails (UX-133)', async () => {
    vi.mocked(removeCourse).mockRejectedValueOnce(new Error('gone'))
    const queryClient = renderCard()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    fireEvent.click(screen.getByRole('button', { name: 'Покинуть курс' }))
    const confirm = (await screen.findAllByRole('button', { name: 'Покинуть курс' })).at(-1)!
    fireEvent.click(confirm)
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['trail', 'current'] }))
  })

  it('labels the certificate control as "view", since nothing is downloaded', () => {
    renderCard()
    const link = screen.getByRole('link', { name: /Просмотреть сертификат/ })
    expect(link).toHaveAttribute('href', '/certificates/CODE-1/verify')
    expect(screen.queryByText('Скачать сертификат')).not.toBeInTheDocument()
  })
})
