/** @vitest-environment jsdom */
// UX-280: a fully static /unauthorized body next to its locale-reading
// generateMetadata() is what Next 16 flags as «URL data in generateMetadata()»;
// the page carries a request-time marker (connection() inside <Suspense>).
import { render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vite-plus/test'

import ruMessages from '@/messages/ru-RU.json'

const { connection } = vi.hoisted(() => ({ connection: vi.fn(async () => {}) }))
vi.mock('next/server', () => ({ connection }))

import UnauthorizedPage from '@/app/[locale]/(platform)/unauthorized/page'

describe('/unauthorized body', () => {
  it('renders the card and marks the page request-time', async () => {
    render(
      <NextIntlClientProvider locale="ru" messages={ruMessages}>
        <UnauthorizedPage />
      </NextIntlClientProvider>,
    )
    expect(screen.getByRole('heading', { name: ruMessages.UnauthorizedPage.title })).toBeTruthy()
    await waitFor(() => expect(connection).toHaveBeenCalled())
  })
})
