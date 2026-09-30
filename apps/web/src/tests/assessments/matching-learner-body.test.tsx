/** @vitest-environment jsdom */
// Q-2026-09-12-1: the learner's matching item is built from
// `MatchingLearnerBody` (two columns, right one shuffled by the server), never
// from the author's `pairs`.

import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vite-plus/test'

import { itemFromWire } from '@/features/assessments/domain/assessment-wire'
import { MatchingItemAttempt, matchingColumns } from '@/features/assessments/items/matching'
import type { MatchingAnswer, MatchingBody } from '@/features/assessments/items/matching'
import type { AssessmentItem } from '@/lib/api/generated/zod'
import enMessages from '@/messages/en-US.json'
import kkMessages from '@/messages/kk-KZ.json'
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

  // Critic 9 T6: the right column must be visible as a list, not only inside
  // each row's <select>.
  it('lists the right column visibly and ticks the options already used', () => {
    const body = itemFromWire(wireItem).body as MatchingBody
    render(
      <NextIntlClientProvider locale="ru" messages={ruMessages}>
        <MatchingItemAttempt
          item={body}
          answer={{ kind: 'MATCHING', matches: [{ left: 'Казахстан', right: 'Астана' }] }}
          onAnswerChange={vi.fn()}
        />
      </NextIntlClientProvider>,
    )
    const list = screen.getByRole('list', { name: 'Справа (соответствие)' })
    const items = [...list.querySelectorAll('li')]
    expect(items.map(li => li.textContent)).toEqual(['Париж', 'Астана'])
    expect(items[1]?.querySelector('svg')).not.toBeNull()
    expect(items[0]?.querySelector('svg')).toBeNull()
  })

  // Critic 9 T6: the teacher review printed the raw key
  // `Features.Assessments.Items.Matching.correct` — every key the component
  // asks for must exist in all three catalogs.
  it('has every t() key of the matching component in ru, kk and en', () => {
    const source = readFileSync(path.resolve(__dirname, '../../features/assessments/items/matching/index.tsx'), 'utf8')
    const keys = [...source.matchAll(/(?<![\w.])t\('([^']+)'/g)].map(m => m[1]!)
    expect(keys.length).toBeGreaterThan(0)
    for (const [locale, messages] of Object.entries({ ru: ruMessages, kk: kkMessages, en: enMessages })) {
      const block = (messages as { Features: { Assessments: { Items: { Matching: Record<string, string> } } } })
        .Features.Assessments.Items.Matching
      const missing = keys.filter(key => typeof block[key] !== 'string')
      expect(missing, locale).toEqual([])
    }
  })
})
