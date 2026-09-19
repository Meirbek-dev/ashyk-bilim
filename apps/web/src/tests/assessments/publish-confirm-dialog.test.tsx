/** @vitest-environment jsdom */
// UX-011: the publish confirmation dialog must show a value for every impact row.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vite-plus/test'

import PublishDashboardTab from '@/features/assessments/studio/tabs/PublishDashboardTab'
import type { AssessmentEditorState } from '@/features/assessments/studio/studioTypes'
import type { AssessmentItem } from '@/features/assessments/domain/items'
import ruMessages from '@/messages/ru-RU.json'
import { APIError } from '@/lib/api/assertSuccess'

vi.mock('@/lib/api-client', () => ({
  apiJson: vi.fn(() => Promise.resolve({ effective_user_count: 12 })),
}))
vi.mock('@/i18n/navigation', () => ({
  Link: (props: React.ComponentProps<'a'>) => <a {...props} />,
}))
// The date-time picker is a nested popover + calendar; a plain input drives the same `onChange`.
vi.mock('@/components/ui/calendar', () => ({
  CalendarDateTimePicker: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <input aria-label="schedule-at" value={value} onChange={event => onChange(event.target.value)} />
  ),
}))

const assessmentState = {
  title: 'Итоговый тест',
  description: '',
  dueAt: '',
  gradingType: 'NUMERIC',
  maxAttempts: '1',
  timeLimitMinutes: '50',
  copyPasteProtection: false,
  tabSwitchDetection: false,
  devtoolsDetection: false,
  rightClickDisable: false,
  fullscreenEnforcement: false,
  violationThreshold: '',
  allowResultReview: true,
  showCorrectAnswers: true,
  passThreshold: '',
  randomizeQuestions: false,
  randomizeOptions: false,
  partialCredit: false,
  gracePeriodMinutes: '',
  availableFrom: '',
  negativeMarkingPercent: '',
} satisfies AssessmentEditorState

const items = [
  { item_uuid: 'i1', kind: 'CHOICE', title: 'Q1', max_score: 5, body: {}, metadata: {} },
  { item_uuid: 'i2', kind: 'OPEN_TEXT', title: 'Q2', max_score: 3, body: {}, metadata: {} },
] as unknown as AssessmentItem[]

function rowValue(label: string) {
  return within(screen.getByRole('dialog')).getByText(label).nextElementSibling?.textContent
}

describe('publish confirmation dialog (UX-011)', () => {
  it('fills every impact row from the studio state', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <NextIntlClientProvider locale="ru" messages={ruMessages}>
          <PublishDashboardTab
            assessmentUuid="asm-1"
            lifecycle="DRAFT"
            items={items}
            totalPoints={8}
            assessmentState={assessmentState}
            validationIssues={[]}
            canPublish
            canSchedule
            canArchive
            onSwitchToBuilder={() => undefined}
            onLifecycleChange={() => undefined}
          />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByText('Опубликовать'))
    await waitFor(() => expect(screen.getByText('Затронутые учащиеся')).toBeInTheDocument())

    expect(rowValue('Затронутые учащиеся')).toBe('12')
    expect(rowValue('Вопросы')).toBe('2')
    expect(rowValue('Баллы')).toBe('8')
    expect(rowValue('Лимит времени')).toBe('50 мин')
    expect(rowValue('Попытки')).toBe('1')
  })

  // BUG-171: the archived arm — «В архиве», a restore button, no publish/schedule.
  it('renders the archived state with a restore-to-draft action only', () => {
    const onLifecycleChange = vi.fn()
    render(
      <QueryClientProvider client={new QueryClient()}>
        <NextIntlClientProvider locale="ru" messages={ruMessages}>
          <PublishDashboardTab
            assessmentUuid="asm-1"
            lifecycle="ARCHIVED"
            items={items}
            totalPoints={8}
            assessmentState={assessmentState}
            validationIssues={[]}
            canPublish
            canSchedule={false}
            canArchive={false}
            onSwitchToBuilder={() => undefined}
            onLifecycleChange={onLifecycleChange}
          />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    )

    expect(screen.getByText('В архиве')).toBeInTheDocument()
    expect(screen.queryByText('Опубликовать')).toBeNull()
    expect(screen.queryByText('Запланировать')).toBeNull()
    fireEvent.click(screen.getByText('Вернуть в черновики'))
    expect(onLifecycleChange).toHaveBeenCalledWith('DRAFT')
  })

  // UX-128: a publish date past the policy due date is refused on the date
  // field — client-side first, and again when the server says `schedule.after_due_at`.
  it('surfaces schedule.after_due_at on the date field and keeps the date', async () => {
    const onLifecycleChange = vi.fn(() =>
      Promise.reject(
        new APIError({
          status: 422,
          code: 'validation-failed',
          message: 'validation failed',
          fieldErrors: [
            { field: 'publish', code: 'schedule.after_due_at', message: 'scheduled opening is after the due date' },
          ],
        }),
      ),
    )
    render(
      <QueryClientProvider client={new QueryClient()}>
        <NextIntlClientProvider locale="ru" messages={ruMessages}>
          <PublishDashboardTab
            assessmentUuid="asm-1"
            lifecycle="DRAFT"
            items={items}
            totalPoints={8}
            assessmentState={{
              ...assessmentState,
              dueAt: '2030-01-10T10:00:00.000Z',
              maxAttempts: '',
              timeLimitMinutes: '',
            }}
            validationIssues={[]}
            canPublish
            canSchedule
            canArchive
            onSwitchToBuilder={() => undefined}
            onLifecycleChange={onLifecycleChange}
          />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    )
    const hint = 'Дата публикации должна быть раньше срока сдачи.'
    fireEvent.click(screen.getByRole('button', { name: /Запланировать/ }))
    const dateInput = await screen.findByLabelText('schedule-at')

    // After the due date: the hint shows and the button stays disabled — no request.
    fireEvent.change(dateInput, { target: { value: '2030-01-20T10:00' } })
    expect(screen.getByRole('alert')).toHaveTextContent(hint)
    const scheduleButtons = () => screen.getAllByRole('button', { name: /^Запланировать$/ })
    expect(scheduleButtons().at(-1)).toBeDisabled()

    // Before the due date on the client, refused by the server: the hint comes
    // back on the field with the picked date still there.
    fireEvent.change(dateInput, { target: { value: '2030-01-05T10:00' } })
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(scheduleButtons().at(-1)!)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^Запланировать$/ }))
    await waitFor(() => expect(onLifecycleChange).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(hint))
    expect(screen.getByLabelText('schedule-at')).toHaveValue('2030-01-05T10:00')
  })
})
