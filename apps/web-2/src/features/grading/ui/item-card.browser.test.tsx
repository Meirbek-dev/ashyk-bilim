import { describe, expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'

import type { AssessmentItem } from '#/shared/api/gen/types.gen'
import { renderInRouter } from '#/shared/components/testing'

import { ItemCard } from './item-card'

const item: AssessmentItem = {
  id: 'q1',
  body: {
    kind: 'choice',
    explanation: null,
    variant: 'single_choice',
    prompt: '## **Как работает технология дополненной реальности**',
    options: [{ id: 'o1', text: 'Добавляет цифровые элементы' }],
  },
  kind: 'choice',
  max_score: 1,
  metadata: { difficulty: null, estimated_minutes: null, section_label: null },
  position: 3,
  title: 'Вопрос.',
  assessment_version: 1,
}

describe('ItemCard', () => {
  test('B-GRD-11 the question wording is the rendered markdown, not `## **…**`', async () => {
    const screen = await renderInRouter(
      <ol>
        <ItemCard item={item} answer={undefined} graded={undefined}>
          {null}
        </ItemCard>
      </ol>,
    )
    await expect
      .element(screen.getByRole('heading', { name: 'Как работает технология дополненной реальности' }))
      .toBeInTheDocument()
    expect(screen.getByText('## **', { exact: false }).elements()).toHaveLength(0)
  })

  test('B-GRD-30 an open answer shows the grading criteria of the question author to the grader', async () => {
    const open: AssessmentItem = {
      ...item,
      kind: 'open_text',
      body: { kind: 'open_text', prompt: 'Опишите цикл', min_words: null, rubric: 'Упомянуть **условие** выхода' },
    }
    const screen = await renderInRouter(
      <ol>
        <ItemCard item={open} answer={undefined} graded={undefined}>
          {null}
        </ItemCard>
      </ol>,
    )
    await expect.element(screen.getByRole('heading', { name: m.grading_criteria() })).toBeInTheDocument()
    await expect.element(screen.getByText('условие')).toBeInTheDocument()
  })
})
