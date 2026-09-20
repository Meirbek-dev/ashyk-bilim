/** @vitest-environment jsdom */
// UX-133: «Отметить как завершенное» toasted the raw English server message
// and a double click sent two POSTs (two «Активность выполнена» toasts).
// BUG-221 nit: a 404 (lesson unpublished under the tab) names the cause.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import BottomActionBar from '@/features/student-activity/shell/BottomActionBar'
import { runStudentActivityAction, type StudentActivityRuntime } from '@/features/student-activity/api/runtime'
import { APIError } from '@/lib/api/assertSuccess'
import ruMessages from '@/messages/ru-RU.json'

vi.mock('@/features/student-activity/api/runtime', () => ({ runStudentActivityAction: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const runtime = {
  course: { uuid: 'c1' },
  activity: { uuid: 'a1' },
  outline: [],
  previous: null,
  next: null,
  primary_action: { id: 'mark_complete', enabled: true },
} as unknown as StudentActivityRuntime

function renderBar() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="ru" messages={ruMessages} timeZone="UTC">
        <BottomActionBar courseUuid="c1" runtime={runtime} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  )
  return screen.getByRole('button', { name: /Отметить как завершенное/ })
}

describe('BottomActionBar mark complete', () => {
  beforeEach(() => vi.mocked(toast.error).mockClear())
  it('sends one request for a double click', async () => {
    let finish: (() => void) | undefined
    vi.mocked(runStudentActivityAction).mockImplementation(
      () => new Promise(resolve => (finish = () => resolve(runtime))),
    )
    const button = renderBar()
    fireEvent.click(button)
    fireEvent.click(button)
    await waitFor(() => expect(runStudentActivityAction).toHaveBeenCalled())
    finish?.()
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1))
    expect(runStudentActivityAction).toHaveBeenCalledTimes(1)
  })

  it('toasts the localized problem+json code, not the server text', async () => {
    vi.mocked(runStudentActivityAction).mockRejectedValue(
      new APIError({ status: 404, code: 'not-found', message: 'activity not found' }),
    )
    fireEvent.click(renderBar())
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1))
    const [message] = vi.mocked(toast.error).mock.calls[0]!
    expect(message).not.toContain('activity not found')
    expect(message).toBe(ruMessages.ActivityPage.activityGone)
  })

  it('toasts the generic code for a non-404 failure', async () => {
    vi.mocked(runStudentActivityAction).mockRejectedValue(
      new APIError({ status: 403, code: 'forbidden', message: 'no access to this course' }),
    )
    fireEvent.click(renderBar())
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1))
    expect(vi.mocked(toast.error).mock.calls[0]![0]).toBe(ruMessages.Errors.codes['forbidden'])
  })
})
