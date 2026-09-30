/** @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'

// An empty submit used to toast «Название и инструкции обязательны» and
// leave the fields unmarked (UX-084); the quiz/exam dialogs show inline
// «Требуется …». The dialog now renders `FieldError`s and never calls the API.

const mocks = vi.hoisted(() => ({ create: vi.fn(), toastError: vi.fn() }))

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: mocks.toastError } }))
vi.mock('@/features/file-submissions/services/file-submissions', () => ({
  createFileSubmissionActivity: mocks.create,
}))
vi.mock('@/features/content-markdown', () => ({
  MarkdownEditor: ({ value, onChange }: { value: string; onChange: (next: string) => void }) => (
    <textarea aria-label="instructions" value={value} onChange={event => onChange(event.target.value)} />
  ),
  isMarkdownStructurallyEmpty: (value: string) => value.trim() === '',
}))
vi.mock('@/components/ui/calendar', () => ({ CalendarDatePicker: () => null }))

import FileSubmissionActivityModal from '@/components/Objects/Modals/Activities/Create/NewActivityModal/FileSubmissionActivityModal'

describe('FileSubmissionActivityModal validation', () => {
  it('marks the empty title and instructions inline instead of toasting', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <FileSubmissionActivityModal chapterId="chapter-1" closeModal={vi.fn()} />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'createActivity' }))

    const alerts = screen.getAllByRole('alert').map(node => node.textContent)
    expect(alerts).toEqual(['titleRequired', 'instructionsRequired'])
    expect(screen.getByLabelText('title')).toHaveAttribute('aria-invalid', 'true')
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.toastError).not.toHaveBeenCalled()

    // Filling the title clears its error on the next submit; instructions stay flagged.
    fireEvent.change(screen.getByLabelText('title'), { target: { value: 'Essay' } })
    fireEvent.click(screen.getByRole('button', { name: 'createActivity' }))
    expect(screen.getAllByRole('alert').map(node => node.textContent)).toEqual(['instructionsRequired'])
    expect(mocks.create).not.toHaveBeenCalled()
  })
})
