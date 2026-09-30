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

function renderNewCollection() {
  return render(
    <NextIntlClientProvider locale="ru" messages={ruMessages}>
      <NewCollection />
    </NextIntlClientProvider>,
  )
}

// BUG-014: the row's div onClick toggled a second time on a checkbox click and
// cancelled it; the checkbox itself (mouse and Space) must select the course.
describe('NewCollection course picker checkbox', () => {
  it('toggles on the checkbox itself, via Space, and via the row label', async () => {
    renderNewCollection()
    const checkbox = screen.getByRole('checkbox', { name: 'Python' })
    expect(screen.getAllByText('Курсы не выбраны').length).toBeGreaterThan(0)

    fireEvent.click(checkbox)
    await waitFor(() => expect(checkbox).toHaveAttribute('aria-checked', 'true'))
    expect(screen.getAllByText('1 курс выбран').length).toBeGreaterThan(0)

    fireEvent.click(checkbox)
    await waitFor(() => expect(checkbox).toHaveAttribute('aria-checked', 'false'))

    fireEvent.click(screen.getByRole('heading', { name: 'Python' }))
    await waitFor(() => expect(checkbox).toHaveAttribute('aria-checked', 'true'))

    checkbox.focus()
    fireEvent.keyDown(checkbox, { key: ' ' })
    fireEvent.keyUp(checkbox, { key: ' ' })
    await waitFor(() => expect(checkbox).toHaveAttribute('aria-checked', 'false'))
  })
})

// UX-051 (BUG-013): an empty name is a field error on the input, not only a toast.
describe('NewCollection required fields', () => {
  it('marks the empty name invalid inline and focuses it', async () => {
    renderNewCollection()
    fireEvent.click(screen.getByRole('button', { name: ruMessages.NewCollectionPage.createButton }))
    const name = screen.getByLabelText(/Название/)
    await waitFor(() => expect(name).toHaveAttribute('aria-invalid', 'true'))
    expect(screen.getByRole('alert')).toHaveTextContent(ruMessages.NewCollectionPage.toast.missingName)
    expect(document.activeElement).toBe(name)
    expect(toast.error).not.toHaveBeenCalledWith(ruMessages.NewCollectionPage.toast.missingName)
  })

  // UX-081: no course selected is inline too, not a toast.
  it('shows the missing-course error inline and clears it on selection', async () => {
    renderNewCollection()
    fireEvent.change(screen.getByLabelText(/Название/), { target: { value: 'Моя коллекция' } })
    fireEvent.change(screen.getByLabelText(/Описание/), { target: { value: 'Описание' } })
    fireEvent.click(screen.getByRole('button', { name: ruMessages.NewCollectionPage.createButton }))
    expect(await screen.findByRole('alert')).toHaveTextContent(ruMessages.NewCollectionPage.toast.noCoursesSelected)
    expect(toast.error).not.toHaveBeenCalledWith(ruMessages.NewCollectionPage.toast.noCoursesSelected)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Python' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })
})
