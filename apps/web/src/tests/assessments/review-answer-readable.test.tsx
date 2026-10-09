/** @vitest-environment jsdom */
// QA-A: the grader saw a form answer as raw JSON keyed by field ids (`{"f1": "Париж"}`), an
// unanswered choice item as an empty card, and the learner got no hint of an open-text minimum.
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it, vi } from 'vite-plus/test'

import type { AssessmentItem } from '@/features/assessments/domain/items'
import { CanonicalAttemptItem, CanonicalReviewAnswer } from '@/features/assessments/shared/canonical-item-rendering'
import ruMessages from '@/messages/ru-RU.json'

vi.mock('@/features/content-markdown', () => ({
  MarkdownContent: ({ content }: { content: string }) => <p>{content}</p>,
}))

const wrap = (node: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="ru" messages={ruMessages as unknown as AbstractIntlMessages}>
      {node}
    </NextIntlClientProvider>,
  )

const item = (body: AssessmentItem['body']) =>
  ({ item_uuid: 'i1', kind: body.kind, title: 'T', max_score: 2, body }) as unknown as AssessmentItem

describe('readable review answers', () => {
  it('shows form fields by label, and a missing value as no answer', () => {
    wrap(
      <CanonicalReviewAnswer
        item={item({
          kind: 'FORM',
          prompt: 'Заполните',
          fields: [
            { id: 'f1', label: 'Столица Франции', field_type: 'text', required: true },
            { id: 'f2', label: '2+2', field_type: 'text', required: true },
          ],
        } as AssessmentItem['body'])}
        answer={{ kind: 'FORM', values: { f1: 'Париж' } }}
      />,
    )
    expect(screen.getByText('Столица Франции')).toBeInTheDocument()
    expect(screen.getByText('Париж')).toBeInTheDocument()
    expect(screen.getByText('Ответ не дан')).toBeInTheDocument()
    expect(screen.queryByText(/"f1"/)).toBeNull()
  })

  it('marks an unanswered multiple-choice item', () => {
    wrap(
      <CanonicalReviewAnswer
        item={item({
          kind: 'CHOICE',
          prompt: 'Выберите',
          multiple: true,
          variant: 'MULTIPLE_CHOICE',
          options: [{ id: 'a', text: 'A', is_correct: true }],
        } as unknown as AssessmentItem['body'])}
        answer={{ kind: 'CHOICE', selected: [] }}
      />,
    )
    expect(screen.getByText('Ответ не дан')).toBeInTheDocument()
  })

  it('labels the open-text answer and counts words against the minimum', () => {
    wrap(
      <CanonicalAttemptItem
        item={item({ kind: 'OPEN_TEXT', prompt: 'Опишите', min_words: 3, rubric: null })}
        answer={{ kind: 'OPEN_TEXT', text: 'два слова' }}
        disabled={false}
        onChange={() => {}}
      />,
    )
    expect(screen.getByRole('textbox', { name: 'Ваш ответ' })).toBeInTheDocument()
    expect(screen.getByText('Слов: 2 (минимум 3)')).toBeInTheDocument()
  })
})
