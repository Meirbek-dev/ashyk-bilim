/** @vitest-environment jsdom */
// Owner decision 2026-11-01: a course with learner work may be deleted only after the teacher acknowledges that
// the work, grades and certificates go with it. The confirm reads the deletion preview; a 409
// `course-has-learner-work` (work arrived after the preview) turns into the same warning.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { CourseDeleteDialog } from '@components/Objects/Thumbnails/CourseThumbnail'
import { APIError } from '@/lib/api/assertSuccess'
import type { CourseDeletionPreview } from '@/lib/api/generated/zod'
import ruMessages from '@/messages/ru-RU.json'

const preview = vi.hoisted(() => vi.fn<(courseId: string) => Promise<CourseDeletionPreview>>())

vi.mock('@/lib/api/generated/courses/courses', async importOriginal => ({
  ...(await importOriginal<object>()),
  getCourseDeletionPreviewQueryOptions: (courseId: string, options?: { query?: Record<string, unknown> }) => ({
    queryKey: ['deletion-preview', courseId],
    queryFn: () => preview(courseId),
    ...options?.query,
  }),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/dash/courses',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/i18n/navigation', () => ({ Link: (props: React.ComponentProps<'a'>) => <a {...props} /> }))
vi.mock('@services/media/media', () => ({ getCourseThumbnailMediaDirectory: () => '' }))
vi.mock('@services/config/config', () => ({ getAbsoluteUrl: (p: string) => p, getSiteUrl: () => '' }))
vi.mock('@/hooks/useSession', () => ({ useSession: () => ({ user: { id: 'me' }, can: () => true }) }))
vi.mock('@services/courses/course-delete', () => ({ deleteCourseFromBackend: vi.fn() }))

const NONE = { learners: 0, submissions: 0, file_attempts: 0, certificates: 0 }
const WORK = { learners: 3, submissions: 5, file_attempts: 2, certificates: 1 }
const work = ruMessages.DashPage.CourseManagement.DeleteLearnerWork
const deleteLabel = ruMessages.Components.CourseThumbnail.deleteButtonText

function renderDialog(onConfirm: (options: { acknowledgeLearnerWork: boolean }) => Promise<void>) {
  const onOpenChange = vi.fn()
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <NextIntlClientProvider locale="ru" messages={ruMessages} timeZone="UTC">
        <CourseDeleteDialog open onOpenChange={onOpenChange} courseUuid="c1" courseName="Курс" onConfirm={onConfirm} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  )
  return { onOpenChange }
}

const confirmButton = () => screen.getByRole('button', { name: deleteLabel })

describe('course delete with learner work', () => {
  beforeEach(() => preview.mockReset())

  it('behaves as before when the preview is all zero', async () => {
    preview.mockResolvedValue(NONE)
    const onConfirm = vi.fn(async () => {})
    const { onOpenChange } = renderDialog(onConfirm)

    await waitFor(() => expect(confirmButton()).toBeEnabled())
    expect(preview).toHaveBeenCalledWith('c1')
    expect(screen.queryByText(work.title)).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()

    fireEvent.click(confirmButton())
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ acknowledgeLearnerWork: false }))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('lists the work and requires the acknowledgement before deleting', async () => {
    preview.mockResolvedValue(WORK)
    const onConfirm = vi.fn(async () => {})
    renderDialog(onConfirm)

    expect(await screen.findByText(work.title)).toBeInTheDocument()
    expect(screen.getByText('3 учащихся с работами в курсе')).toBeInTheDocument()
    expect(screen.getByText('5 сданных работ (тесты, экзамены, задачи с кодом)')).toBeInTheDocument()
    expect(screen.getByText('2 попытки сдачи файлов')).toBeInTheDocument()
    expect(screen.getByText('1 выданный сертификат: его код проверки перестанет работать')).toBeInTheDocument()
    expect(screen.getByText(work.archiveInstead)).toBeInTheDocument()
    expect(confirmButton()).toBeDisabled()

    fireEvent.click(screen.getByRole('checkbox', { name: work.acknowledge }))
    await waitFor(() => expect(confirmButton()).toBeEnabled())
    fireEvent.click(confirmButton())
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ acknowledgeLearnerWork: true }))
  })

  it('turns a 409 course-has-learner-work into the warning instead of an error', async () => {
    preview.mockResolvedValue(NONE)
    const onConfirm = vi
      .fn<(options: { acknowledgeLearnerWork: boolean }) => Promise<void>>()
      .mockRejectedValueOnce(
        new APIError({
          status: 409,
          code: 'course-has-learner-work',
          message: 'learner work',
          details: { learners: 1, submissions: 1, file_attempts: 0, certificates: 0 },
        }),
      )
      .mockResolvedValueOnce(undefined)
    const { onOpenChange } = renderDialog(onConfirm)

    await waitFor(() => expect(confirmButton()).toBeEnabled())
    fireEvent.click(confirmButton())

    expect(await screen.findByText(work.title)).toBeInTheDocument()
    expect(screen.getByText('1 учащийся с работами в курсе')).toBeInTheDocument()
    expect(screen.queryByText(/попыт/)).not.toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(confirmButton()).toBeDisabled()

    fireEvent.click(screen.getByRole('checkbox', { name: work.acknowledge }))
    await waitFor(() => expect(confirmButton()).toBeEnabled())
    fireEvent.click(confirmButton())
    await waitFor(() => expect(onConfirm).toHaveBeenLastCalledWith({ acknowledgeLearnerWork: true }))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })
})
