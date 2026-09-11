/** @vitest-environment jsdom */
// BUG-028: the "Посмотреть ответы" row shows the earned score from the
// released `GradedItem`s and the timestamp is formatted for the app locale.

import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it } from 'vite-plus/test'

import AttemptResultCard from '@/features/assessments/shell/AttemptResultCard'
import { DEFAULT_POLICY_VIEW } from '@/features/assessments/domain/policy'
import type { AttemptViewModel } from '@/features/assessments/domain/view-models'
import ruMessages from '@/messages/ru-RU.json'

const itemId = '01a091a1-afdd-7607-b09a-e42c0f895903'

const vm = {
  kind: 'TYPE_CUSTOM',
  title: 'Викторина 1',
  isResultVisible: true,
  isReturnedForRevision: false,
  canStartRevision: false,
  canSubmit: false,
  score: { percent: 100, source: 'final' },
  startedAt: '2026-09-11T18:04:39.000Z',
  policy: DEFAULT_POLICY_VIEW,
  items: [{ id: itemId, item_uuid: itemId, order: 0, kind: 'CHOICE', title: 'Вопрос', max_score: 1 }],
  itemScores: { [itemId]: { score: 100, maxScore: 100 } },
} as unknown as AttemptViewModel

describe('AttemptResultCard breakdown (BUG-028)', () => {
  it('shows the earned score next to the max score', () => {
    render(
      <NextIntlClientProvider locale="ru" messages={ruMessages} timeZone="UTC">
        <AttemptResultCard vm={vm} />
      </NextIntlClientProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Посмотреть ответы' }))
    expect(screen.getByTestId(`item-score-${itemId}`)).toHaveTextContent('100 / 100')
    // ru date, not en-US "9/11/2026, 6:04:39 PM"
    expect(screen.queryByText(/9\/11\/2026/)).toBeNull()
    expect(screen.getByText(/11 сент\. 2026 г\./)).toBeInTheDocument()
  })
})
