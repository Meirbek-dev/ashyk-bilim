/** @vitest-environment jsdom */
import { fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vite-plus/test'

import ruMessages from '@/messages/ru-RU.json'
import { APIError } from '@/lib/api/assertSuccess'

const { apiJson, listCourses, toast } = vi.hoisted(() => ({
  apiJson: vi.fn(),
  listCourses: vi.fn(async (_path: string) => ({
    items: [{ id: 'c1', name: 'Python', description: null, thumbnail_key: null, public: false }],
    next_cursor: null as string | null,
  })),
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}))

// `courses?…` is the picker's search; anything else is the create call.
vi.mock('@/lib/api-client', () => ({
  apiJson: (path: string, ...rest: unknown[]) =>
    path.startsWith('courses?') ? listCourses(path) : apiJson(path, ...rest),
}))
vi.mock('sonner', () => ({ toast }))
vi.mock('@/lib/cache/revalidate', () => ({ revalidateTags: vi.fn() }))
const render = (ui: ReactElement) =>
  rtlRender(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>)

import NewCollection, { hiddenFromOthers } from '@/app/_shared/withmenu/collections/new/NewCollection'

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
    await screen.findByRole('checkbox', { name: 'Python' })

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

async function renderNewCollection() {
  const view = render(
    <NextIntlClientProvider locale="ru" messages={ruMessages}>
      <NewCollection />
    </NextIntlClientProvider>,
  )
  await screen.findByRole('checkbox', { name: 'Python' })
  return view
}

// BUG-014: the row's div onClick toggled a second time on a checkbox click and
// cancelled it; the checkbox itself (mouse and Space) must select the course.
describe('NewCollection course picker checkbox', () => {
  it('toggles on the checkbox itself, via Space, and via the row label', async () => {
    await renderNewCollection()
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
    await renderNewCollection()
    fireEvent.click(screen.getByRole('button', { name: ruMessages.NewCollectionPage.createButton }))
    const name = screen.getByLabelText(/Название/)
    await waitFor(() => expect(name).toHaveAttribute('aria-invalid', 'true'))
    expect(screen.getByRole('alert')).toHaveTextContent(ruMessages.NewCollectionPage.toast.missingName)
    expect(document.activeElement).toBe(name)
    expect(toast.error).not.toHaveBeenCalledWith(ruMessages.NewCollectionPage.toast.missingName)
  })

  // UX-081: no course selected is inline too, not a toast.
  it('shows the missing-course error inline and clears it on selection', async () => {
    await renderNewCollection()
    fireEvent.change(screen.getByLabelText(/Название/), { target: { value: 'Моя коллекция' } })
    fireEvent.change(screen.getByLabelText(/Описание/), { target: { value: 'Описание' } })
    fireEvent.click(screen.getByRole('button', { name: ruMessages.NewCollectionPage.createButton }))
    expect(await screen.findByRole('alert')).toHaveTextContent(ruMessages.NewCollectionPage.toast.noCoursesSelected)
    expect(toast.error).not.toHaveBeenCalledWith(ruMessages.NewCollectionPage.toast.noCoursesSelected)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Python' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })
})

// ROUND3-13: a public collection of closed courses is listed to nobody but its author - say so on save.
describe('NewCollection of closed courses', () => {
  it('warns on save that other users will not see a public collection of private courses', async () => {
    apiJson.mockResolvedValueOnce({})
    await renderNewCollection()
    fireEvent.change(screen.getByLabelText(/Название/), { target: { value: 'Моя коллекция' } })
    fireEvent.change(screen.getByLabelText(/Описание/), { target: { value: 'Описание' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Python' }))
    fireEvent.click(screen.getByRole('button', { name: ruMessages.NewCollectionPage.createButton }))
    await waitFor(() =>
      expect(toast.warning).toHaveBeenCalledWith(ruMessages.NewCollectionPage.toast.success, {
        description: 'Курсы этой коллекции закрыты — другие пользователи её не увидят.',
      }),
    )
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('is quiet when one course is public and live, or the collection is private', () => {
    expect(hiddenFromOthers(true, [{ public: false }, { public: true, archived_at_unix: null }])).toBe(false)
    expect(hiddenFromOthers(true, [{ public: true, archived_at_unix: 1 }])).toBe(true)
    expect(hiddenFromOthers(false, [{ public: false }])).toBe(false)
  })
})

// The picker searched only the first 20 courses in the browser: it now asks the server (`q`) and pages on.
describe('NewCollection course search', () => {
  it('searches the server and loads further pages', async () => {
    listCourses.mockImplementation(async (path: string) =>
      path.includes('cursor=p2')
        ? {
            items: [{ id: 'c3', name: 'Rust', description: null, thumbnail_key: null, public: true }],
            next_cursor: null,
          }
        : path.includes('q=')
          ? {
              items: [{ id: 'c2', name: 'Go', description: null, thumbnail_key: null, public: true }],
              next_cursor: null,
            }
          : {
              items: [{ id: 'c1', name: 'Python', description: null, thumbnail_key: null, public: false }],
              next_cursor: 'p2',
            },
    )
    await renderNewCollection()
    fireEvent.click(screen.getByRole('button', { name: ruMessages.NewCollectionPage.loadMoreCourses }))
    expect(await screen.findByRole('checkbox', { name: 'Rust' })).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText(ruMessages.NewCollectionPage.searchPlaceholder), {
      target: { value: 'Go' },
    })
    expect(await screen.findByRole('checkbox', { name: 'Go' })).toBeInTheDocument()
    expect(listCourses).toHaveBeenCalledWith(expect.stringContaining('q=Go'))
    expect(listCourses).toHaveBeenCalledWith(expect.stringContaining('limit=50'))
  })
})
