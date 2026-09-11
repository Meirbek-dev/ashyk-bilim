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

vi.mock('@/lib/api-client', () => ({
  apiJson: vi.fn(() => Promise.resolve({ effective_user_count: 12 })),
}))
vi.mock('@/i18n/navigation', () => ({
  Link: (props: React.ComponentProps<'a'>) => <a {...props} />,
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
})
