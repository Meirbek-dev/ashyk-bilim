/** @vitest-environment jsdom */
// UX-250: an enrolled course card shows a skeleton, not «0%», until its
// learner-state resolves; the CTA stays usable meanwhile.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vite-plus/test'

import CourseThumbnail from '@components/Objects/Thumbnails/CourseThumbnail'
import ruMessages from '@/messages/ru-RU.json'

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
// The learner-state never resolves: the card must not invent a percentage.
vi.mock('@/lib/api-client', () => ({ apiJson: () => new Promise(() => {}) }))

const courseId = '01a0910d-2963-7483-a97d-40dc56e9aa20'

describe('UX-250 course card progress', () => {
  it('shows a skeleton instead of 0% while the learner-state is loading', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <NextIntlClientProvider locale="ru" messages={ruMessages} timeZone="UTC">
          <CourseThumbnail
            course={{ course_uuid: courseId, name: 'Основы Python' }}
            trailData={{ runs: [{ course: { course_uuid: courseId }, steps: [] }] } as unknown as AppTrailData}
          />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    )
    expect(screen.queryByText('0%')).toBeNull()
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.getByText('…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Продолжить обучение' })).not.toHaveAttribute('aria-disabled', 'true')
  })
})
