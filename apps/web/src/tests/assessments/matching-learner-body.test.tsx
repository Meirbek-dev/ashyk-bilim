/** @vitest-environment jsdom */
// Q-2026-09-12-1: the learner's matching item is built from
// `MatchingLearnerBody` (two columns, right one shuffled by the server), never
// from the author's `pairs`.

import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vite-plus/test'

import { itemFromWire } from '@/features/assessments/domain/assessment-wire'
import { MatchingItemAttempt, matchingColumns } from '@/features/assessments/items/matching'
import type { MatchingAnswer, MatchingBody } from '@/features/assessments/items/matching'
import type { AssessmentItem } from '@/lib/api/generated/zod'
import ruMessages from '@/messages/ru-RU.json'

vi.mock('@/features/content-markdown', () => ({
  MarkdownContent: ({ content }: { content: string }) => <p>{content}</p>,
}))

const wireItem = {
  id: 'item_1',
  position: 1,
  kind: 'matching',
  title: 'Столицы',
  max_score: 4,
  metadata: {},
  body: {
    kind: 'matching',
    prompt: 'Сопоставьте страны и столицы',
    left: [
      { id: 'Казахстан', text: 'Казахстан' },
      { id: 'Франция', text: 'Франция' },
    ],
    right: [
      { id: 'Париж', text: 'Париж' },
      { id: 'Астана', text: 'Астана' },
    ],
  },
} as unknown as AssessmentItem

describe('matching learner body', () => {
  it('maps the learner wire shape onto columns and keeps pairs empty', () => {
    const item = itemFromWire(wireItem)
    expect(item.body.kind).toBe('MATCHING')
    if (item.body.kind !== 'MATCHING') throw new Error('kind')
    expect(item.body.pairs).toEqual([])
    expect(matchingColumns(item.body).right.map(o => o.text)).toEqual(['Париж', 'Астана'])
  })

  it('renders two columns from the learner body and submits id → id', () => {
    const onAnswerChange = vi.fn()
    const body = itemFromWire(wireItem).body as MatchingBody
    render(
      <NextIntlClientProvider locale="ru" messages={ruMessages}>
        <MatchingItemAttempt item={body} answer={null} onAnswerChange={onAnswerChange} />
      </NextIntlClientProvider>,
    )

    expect(screen.getByText('Казахстан')).toBeInTheDocument()
    expect(screen.getByText('Франция')).toBeInTheDocument()
    const select = screen.getByLabelText('Соответствие для: Казахстан') as HTMLSelectElement
    // The right column keeps the server's (shuffled) order.
    expect([...select.options].map(o => o.value)).toEqual(['', 'Париж', 'Астана'])

    fireEvent.change(select, { target: { value: 'Астана' } })
    expect(onAnswerChange).toHaveBeenCalledWith({
      kind: 'MATCHING',
      matches: [{ left: 'Казахстан', right: 'Астана' }],
    } satisfies MatchingAnswer)
  })
})
