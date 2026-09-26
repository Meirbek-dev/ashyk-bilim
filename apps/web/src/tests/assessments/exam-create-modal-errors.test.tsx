/** @vitest-environment jsdom */
// UX-228: a blank («   ») title is caught client-side (trimmed), and a server
// 422 lands on the input it names instead of a generic toast.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vite-plus/test'

import NewExam from '@/components/Objects/Modals/Activities/Create/NewActivityModal/ExamActivityModal'
import { APIError } from '@/lib/api/assertSuccess'
import ruMessages from '@/messages/ru-RU.json'

const mocks = vi.hoisted(() => ({ mutateAsync: vi.fn(), toastError: vi.fn() }))

vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }))
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/features/assessments/hooks/exam', () => ({
  useCreateExamWithActivity: () => ({ mutateAsync: mocks.mutateAsync }),
}))

function renderModal() {
  return render(
    <NextIntlClientProvider locale="ru" messages={ruMessages}>
      <QueryClientProvider client={new QueryClient()}>
        <NewExam kind="quiz" chapterId="ch1" course={null as never} closeModal={vi.fn()} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  )
}

describe('exam/quiz create modal errors (UX-228)', () => {
  it('rejects a whitespace-only title before calling the server', async () => {
    renderModal()
    fireEvent.change(screen.getByLabelText('Название активности'), { target: { value: '   ' } })
    fireEvent.change(document.querySelector('#exam_description') as Element, { target: { value: 'd' } })
    fireEvent.submit(document.querySelector('form') as HTMLFormElement)
    await screen.findByText('Требуется название активности')
    expect(mocks.mutateAsync).not.toHaveBeenCalled()
  })

  it('shows the server field error under the title, trimmed on the wire', async () => {
    mocks.mutateAsync.mockRejectedValue(
      new APIError({
        status: 422,
        code: 'validation-failed',
        message: 'validation failed',
        fieldErrors: [{ field: 'title', code: 'too-long', message: 'title too long' }],
      }),
    )
    renderModal()
    fireEvent.change(screen.getByLabelText('Название активности'), { target: { value: '  Тест 1  ' } })
    fireEvent.change(document.querySelector('#exam_description') as Element, { target: { value: 'd' } })
    fireEvent.submit(document.querySelector('form') as HTMLFormElement)
    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalled())
    expect(mocks.mutateAsync.mock.calls[0]?.[0]).toMatchObject({ activityName: 'Тест 1' })
    await screen.findByText(ruMessages.Errors.fields['too-long'])
    expect(mocks.toastError).not.toHaveBeenCalled()
  })
})
