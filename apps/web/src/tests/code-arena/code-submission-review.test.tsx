/** @vitest-environment jsdom */
// UX-226: a migrated code attempt with no test run read «Решение требует
// проверки · ПРОЙДЕНО ТЕСТОВ: 0/0» and «ID оцененного языка: 71».
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vite-plus/test'

import { CodeSubmissionReview } from '@/features/code-arena/review/CodeSubmissionReview'
import ruMessages from '@/messages/ru-RU.json'

vi.mock('@/components/features/courses/code-challenges/CodeEditor', () => ({ CodeEditor: () => null }))
vi.mock('@/features/code-arena/review/CodeDiffViewer', () => ({ CodeDiffViewer: () => null }))

function renderReview(languages: { id: number; name: string }[] | null) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, queryFn: () => new Promise(() => {}) } },
  })
  if (languages) client.setQueryData(['code-challenges', 'languages'], languages)
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="ru" messages={ruMessages} timeZone="UTC">
        <CodeSubmissionReview answer={{ kind: 'CODE', language: 71, source: 'print(1)', latest_run: null } as never} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  )
}

describe('code attempt review header', () => {
  it('shows no verdict without a test run and names the language', () => {
    renderReview([{ id: 71, name: 'Python (3.8.1)' }])
    expect(screen.queryByText('Решение требует проверки')).not.toBeInTheDocument()
    expect(screen.queryByText(/0\/0/)).not.toBeInTheDocument()
    expect(screen.getByText('Язык: Python (3.8.1)')).toBeInTheDocument()
  })

  it('hides the raw id when the language is unknown', () => {
    renderReview(null)
    expect(screen.queryByText(/71/)).not.toBeInTheDocument()
  })
})
