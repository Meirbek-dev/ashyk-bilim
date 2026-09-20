/** @vitest-environment jsdom */
// Gauntlet F08/F17: «Покинуть курс» destroyed progress on a bare click with no
// toast; the certificate control said «Скачать» but only opened the verify page.
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { toast } from 'sonner'
import TrailCourseElement from '@components/Pages/Trail/TrailCourseElement'
import { apiJson } from '@/lib/api-client'
import { APIError } from '@/lib/api/assertSuccess'
import ruMessages from '@/messages/ru-RU.json'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/i18n/navigation', () => ({ Link: (props: React.ComponentProps<'a'>) => <a {...props} /> }))
vi.mock('@/features/certifications/hooks/useCertifications', () => ({
  useUserCertificateByCourse: () => ({
    data: { data: [{ certificate_user: { user_certification_uuid: 'CODE-1' } }] },
    isPending: false,
  }),
}))
vi.mock('@/lib/api-client', () => ({ apiJson: vi.fn(async () => undefined) }))
vi.mock('@/lib/cache/revalidate', () => ({ revalidateTags: vi.fn(async () => undefined) }))
vi.mock('@services/media/media', () => ({ getCourseThumbnailMediaDirectory: () => '' }))
vi.mock('@services/config/config', () => ({
  getAbsoluteUrl: (p: string) => p,
  getSiteUrl: () => 'http://localhost:3000',
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

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
  beforeEach(() => vi.clearAllMocks())

  it('asks for confirmation, unenrols only on confirm and toasts', async () => {
    const queryClient = renderCard()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    fireEvent.click(screen.getByRole('button', { name: 'Покинуть курс' }))
    expect(apiJson).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Покинуть курс «Основы Python»?')
    fireEvent.click(screen.getByRole('button', { name: 'Остаться' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(apiJson).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Покинуть курс' }))
    const confirm = (await screen.findAllByRole('button', { name: 'Покинуть курс' })).at(-1)!
    fireEvent.click(confirm)
    await waitFor(() => expect(apiJson).toHaveBeenCalledWith(`trail/courses/${courseId}`, { method: 'DELETE' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Вы покинули курс «Основы Python»'))
    // The card goes with the toast: the trail query is dropped before it fires (UX-081).
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['trail', 'current'] })
    expect(invalidate.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(toast.success).mock.invocationCallOrder[0]!)
  })

  it('drops the stale card when leaving fails (UX-133)', async () => {
    vi.mocked(apiJson).mockRejectedValueOnce(new Error('gone'))
    const queryClient = renderCard()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    fireEvent.click(screen.getByRole('button', { name: 'Покинуть курс' }))
    const confirm = (await screen.findAllByRole('button', { name: 'Покинуть курс' })).at(-1)!
    fireEvent.click(confirm)
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['trail', 'current'] }))
  })

  // UX-140: the run was already deleted elsewhere — a 404 reads as «уже
  // покинули», not «Не удалось покинуть курс», and the card still goes.
  it('404 on leave → «Вы уже покинули курс» and the card is dropped', async () => {
    vi.mocked(apiJson).mockRejectedValueOnce(new APIError({ status: 404, code: 'not-found', message: 'run not found' }))
    const queryClient = renderCard()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    fireEvent.click(screen.getByRole('button', { name: 'Покинуть курс' }))
    const confirm = (await screen.findAllByRole('button', { name: 'Покинуть курс' })).at(-1)!
    fireEvent.click(confirm)
    await waitFor(() => expect(toast.info).toHaveBeenCalledWith('Вы уже покинули курс'))
    expect(toast.error).not.toHaveBeenCalled()
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['trail', 'current'] }))
  })

  it('labels the certificate control as "view", since nothing is downloaded', () => {
    renderCard()
    const link = screen.getByRole('link', { name: /Просмотреть сертификат/ })
    expect(link).toHaveAttribute('href', '/certificates/CODE-1/verify')
    expect(screen.queryByText('Скачать сертификат')).not.toBeInTheDocument()
  })
})
