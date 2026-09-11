/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vite-plus/test'

import ruMessages from '@/messages/ru-RU.json'
import { APIError } from '@/lib/api/assertSuccess'

const { apiJson, toast } = vi.hoisted(() => ({
  apiJson: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn() },
}))

vi.mock('@/lib/api-client', () => ({ apiJson }))
vi.mock('sonner', () => ({ toast }))
vi.mock('@/lib/cache/revalidate', () => ({ revalidateTags: vi.fn() }))
vi.mock('@/hooks/useCourseList', () => ({
  useCourseList: () => ({
    data: [{ id: 'c1', name: 'Python', description: null, course_uuid: 'c1', thumbnail_image: null }],
    error: null,
    isLoading: false,
  }),
}))

import NewCollection from '@/app/_shared/withmenu/collections/new/NewCollection'

// jsdom has no Web Animations API; Base UI's ScrollArea polls it.
Element.prototype.getAnimations ??= () => []

// BUG-027: a problem+json 403 must surface as the localized "no access" copy,
// not the generic "try again" prompt.
describe('NewCollection 403 handling', () => {
  it('toasts Errors.codes.forbidden without a retry action', async () => {
    apiJson.mockRejectedValueOnce(
      new APIError({ status: 403, code: 'forbidden', message: 'collection:create:platform', requestId: null }),
    )

    render(
      <NextIntlClientProvider locale="ru" messages={ruMessages}>
        <NewCollection />
      </NextIntlClientProvider>,
    )

    fireEvent.change(screen.getByLabelText(/Название/), { target: { value: 'Моя коллекция' } })
    fireEvent.change(screen.getByLabelText(/Описание/), { target: { value: 'Описание' } })
    fireEvent.click(screen.getByRole('button', { name: ruMessages.NewCollectionPage.selectAllButton }))
    fireEvent.click(screen.getByRole('button', { name: ruMessages.NewCollectionPage.createButton }))

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    const [message, options] = toast.error.mock.calls[0]!
    expect(message).toBe(ruMessages.Errors.codes.forbidden)
    expect(options?.action).toBeUndefined()
    expect(message).not.toBe(ruMessages.NewCollectionPage.toast.failure)
  })
})
