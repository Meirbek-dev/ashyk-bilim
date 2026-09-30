/** @vitest-environment jsdom */
// UX-250: an enrolled course card reads the run's `progress_pct` from the one
// `GET /trail` the page made — no per-card learner-state query, no «0%»
// placeholder while one resolves; `null` (not projected yet) reads as 0 %.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vite-plus/test'

import CourseThumbnail from '@components/Objects/Thumbnails/CourseThumbnail'
import ruMessages from '@/messages/ru-RU.json'

const apiJson = vi.fn((..._args: unknown[]) => new Promise(() => {}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/i18n/navigation', () => ({ Link: (props: React.ComponentProps<'a'>) => <a {...props} /> }))
vi.mock('@/hooks/useSession', () => ({
  useSession: () => ({
    session: { roles: ['user'], permissions: [] },
    user: { id: 'u1' },
    isAuthenticated: true,
    can: () => false,
  }),
}))
vi.mock('@services/media/media', () => ({ getCourseThumbnailMediaDirectory: () => '' }))
vi.mock('@services/config/config', () => ({
  getAbsoluteUrl: (p: string) => p,
  getSiteUrl: () => 'http://localhost:3000',
}))
vi.mock('@services/courses/course-delete', () => ({ deleteCourseFromBackend: vi.fn() }))
vi.mock('@/lib/api-client', () => ({ apiJson: (...args: unknown[]) => apiJson(...args) }))

const courseId = '01a0910d-2963-7483-a97d-40dc56e9aa20'

function renderCard(progress_pct: number | null) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="ru" messages={ruMessages} timeZone="UTC">
        <CourseThumbnail
          course={{ course_uuid: courseId, name: 'Основы Python' }}
          trailData={
            { runs: [{ course: { course_uuid: courseId }, steps: [], progress_pct }] } as unknown as AppTrailData
          }
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  )
}

describe('UX-250 course card progress', () => {
  it('reads the trail run progress without a learner-state call', () => {
    renderCard(96.7)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '97')
    expect(screen.getByText('97%')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Продолжить обучение' })).toBeInTheDocument()
    expect(apiJson).not.toHaveBeenCalled()
  })

  it('shows 0% for a run with no projection yet, as learner-state would', () => {
    renderCard(null)
    expect(screen.getByText('0%')).toBeInTheDocument()
    expect(apiJson).not.toHaveBeenCalled()
  })

  it('asks learner-state only for a completed run (the certificate CTA, UX-127)', () => {
    renderCard(100)
    expect(apiJson).toHaveBeenCalledWith(`courses/${courseId}/learner-state`, expect.anything(), expect.any(Function))
  })
})
