/** @vitest-environment jsdom */
// UX-164: course cards read authorship from the v2 `creator_id` /
// `contributor_ids` (the legacy `authors` list was never populated): the
// creator gets the owner badge and the `:own` menu, an active contributor
// gets the menu only, anyone else gets neither.
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
    user: { id: 'me' },
    isAuthenticated: true,
    // A teacher: course update/delete on their own courses only.
    can: (_resource: string, _action: string, scope: string) => scope === 'own',
  }),
}))
vi.mock('@services/media/media', () => ({ getCourseThumbnailMediaDirectory: () => '' }))
vi.mock('@services/config/config', () => ({ getAbsoluteUrl: (p: string) => p, getSiteUrl: () => '' }))
vi.mock('@services/courses/courses', () => ({ deleteCourseFromBackend: vi.fn() }))

function card(course: { creator_id?: string | null; contributor_ids?: string[] }) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="ru" messages={ruMessages} timeZone="UTC">
        <CourseThumbnail course={{ course_uuid: 'c1', name: 'Курс', ...course }} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  )
}

describe('UX-164 course card authorship', () => {
  it('creator: owner badge and course menu', () => {
    card({ creator_id: 'me', contributor_ids: [] })
    expect(screen.getByText('Создатель')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Опции курса' })).toBeInTheDocument()
  })

  it('active contributor: course menu, no owner badge', () => {
    card({ creator_id: 'other', contributor_ids: ['me'] })
    expect(screen.queryByText('Создатель')).toBeNull()
    expect(screen.getByRole('button', { name: 'Опции курса' })).toBeInTheDocument()
  })

  it('not an author: neither', () => {
    card({ creator_id: 'other', contributor_ids: [] })
    expect(screen.queryByText('Создатель')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Опции курса' })).toBeNull()
  })
})
