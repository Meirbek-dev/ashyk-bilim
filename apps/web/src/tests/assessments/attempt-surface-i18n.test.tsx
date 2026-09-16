/** @vitest-environment jsdom */
// UX-010: no English or raw kind codes on the ru attempt surface.

import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider, useTranslations } from 'next-intl'
import { describe, expect, it } from 'vite-plus/test'

import { AssessmentActionBar } from '@/features/assessments/shell/AssessmentActionBar'
import AttemptEntryCard from '@/features/assessments/shell/AttemptEntryCard'
import { DEFAULT_POLICY_VIEW } from '@/features/assessments/domain/policy'
import type { AttemptViewModel } from '@/features/assessments/domain/view-models'
import kkMessages from '@/messages/kk-KZ.json'
import ruMessages from '@/messages/ru-RU.json'

function renderRu(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="ru" messages={ruMessages}>
      {ui}
    </NextIntlClientProvider>,
  )
}

const vm = {
  kind: 'TYPE_CUSTOM',
  title: 'Квиз 1',
  description: null,
  recommendedAction: 'start',
  items: [{ item_uuid: 'i1' }],
  policy: { ...DEFAULT_POLICY_VIEW, maxAttempts: 1, timeLimitSeconds: 50 * 60 },
} as unknown as AttemptViewModel

describe('attempt surface i18n (UX-010)', () => {
  it('renders a localized kind label and time limit on the entry card', () => {
    renderRu(<AttemptEntryCard vm={vm} />)
    expect(screen.queryByText(/quiz/i)).toBeNull()
    expect(screen.getByText('Тест')).toBeInTheDocument()
    expect(screen.getByText('50 мин')).toBeInTheDocument()
  })

  // Critic 9: with unlimited attempts and a batch-release hand-in pending the
  // entry card said «Готовы начать» — the receipt line must show instead.
  it('tells the learner the last hand-in awaits the teacher when a retake is offered', () => {
    renderRu(<AttemptEntryCard vm={{ ...vm, releaseState: 'AWAITING_RELEASE' } as AttemptViewModel} />)
    expect(screen.getByText(/Ваша работа получена/)).toBeInTheDocument()
    expect(screen.queryByText('Готовы начать')).toBeNull()
  })

  // UX-097/UX-098: the pending entry card offers the retake as a secondary
  // control and names only the *next* cap (ru/kk/en), never the applied one.
  it('offers «Начать новую попытку» and the next-cap note on a pending retake', () => {
    const pending = { ...vm, releaseState: 'AWAITING_RELEASE', nextAttemptCapPercent: 60 } as AttemptViewModel
    const { unmount } = renderRu(<AttemptEntryCard vm={pending} onStartNewAttempt={() => undefined} />)
    expect(screen.getByTestId('start-new-attempt')).toHaveTextContent('Начать новую попытку')
    expect(screen.getByTestId('attempt-cap-note')).toHaveTextContent('Следующая попытка: не более 60%')
    expect(screen.queryByText(/Применён лимит/)).toBeNull()
    unmount()
    render(
      <NextIntlClientProvider locale="kk" messages={kkMessages}>
        <AttemptEntryCard vm={pending} />
      </NextIntlClientProvider>,
    )
    expect(screen.getByTestId('attempt-cap-note')).toHaveTextContent('Келесі әрекет: 60%-тен аспайды')
    expect(screen.queryByTestId('start-new-attempt')).toBeNull()
  })

  it('renders the answered counter with a Russian plural in the action bar', () => {
    const navigation = {
      current: 1,
      total: 1,
      answered: 1,
      canPrevious: false,
      canNext: false,
      onPrevious: () => undefined,
      onNext: () => undefined,
    }
    renderRu(<AssessmentActionBar controls={{ navigation }} returned={false} />)
    expect(screen.getByText('Отвечено на 1 вопрос · 1 / 1')).toBeInTheDocument()
    expect(screen.queryByText(/answered/)).toBeNull()
  })

  it('agrees the result-card gender in ru and keeps kk grammatical', () => {
    function Labels() {
      const t = useTranslations('Features.ActivityWorkspace')
      return <span>{`${t('assessmentSubmitted')}|${t('retryAssessment')}`}</span>
    }
    renderRu(<Labels />)
    expect(screen.getByText('Учебная задача отправлена|Повторить учебную задачу')).toBeInTheDocument()

    render(
      <NextIntlClientProvider locale="kk" messages={kkMessages}>
        <Labels />
      </NextIntlClientProvider>,
    )
    expect(screen.getByText('Оқу әрекеті жіберілді|Оқу әрекетін қайталау')).toBeInTheDocument()
  })

  it('localizes the studio drag-and-drop screen-reader instructions', () => {
    for (const messages of [ruMessages, kkMessages]) {
      const dnd = (messages as { Common: { DragAndDrop: Record<string, string> } }).Common.DragAndDrop
      expect(dnd.instructions).toBeTruthy()
      expect(dnd.instructions).not.toMatch(/press the space bar/i)
    }
  })
})
