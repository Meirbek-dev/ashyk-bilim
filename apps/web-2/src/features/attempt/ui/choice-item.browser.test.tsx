import { describe, expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import type { AssessmentItem } from '#/shared/api/gen/types.gen'
import { renderInRouter } from '#/shared/components/testing'

import { ChoiceItem } from './choice-item'
import { ItemPrompt } from './item-prompt'
import { OpenTextItem } from './open-text-item'

const picture = { upload_id: 'u1', width: 40, height: 20 }

describe('imported (spreadsheet) questions', () => {
  test('a multi-line option keeps its lines in a monospace block; an option picture without alt names the option', async () => {
    const code = 'int a = 1;\nreturn a;'
    const screen = await renderInRouter(
      <ChoiceItem
        body={{
          explanation: null,
          variant: 'single_choice',
          options: [
            { id: 'o1', text: code },
            { id: 'o2', text: '', media: picture },
          ],
        }}
        assessmentId="a1"
        answer={undefined}
        onChange={() => undefined}
        disabled={false}
      />,
    )
    const block = screen.getByText('int a = 1;', { exact: false })
    await expect.element(block).toHaveClass('font-mono')
    expect(block.element().textContent).toBe(code)
    await expect
      .element(screen.getByRole('img', { name: m.attempt_option_image({ number: 2 }) }))
      .toHaveAttribute('src', '/api/v2/assessments/a1/media/u1')
  })

  test('a plain prompt is text as typed, with its pictures under it', async () => {
    const item: AssessmentItem = {
      id: 'i1',
      title: 'Вопрос',
      body: {
        kind: 'choice',
        explanation: null,
        variant: null,
        prompt: '<b>x</b> *y*',
        prompt_format: 'plain',
        media: [picture],
      },
      kind: 'choice',
      max_score: 1,
      metadata: { difficulty: null, draw_group: null, estimated_minutes: null, section_label: null },
      position: 1,
      assessment_version: 1,
    }
    const screen = await renderInRouter(<ItemPrompt item={item} assessmentId="a1" number={3} />)
    await expect.element(screen.getByText('<b>x</b> *y*')).toBeInTheDocument()
    await expect.element(screen.getByRole('img', { name: m.attempt_question_image({ number: 3 }) })).toBeInTheDocument()
  })

  test('a short answer is one line', async () => {
    const screen = await renderInRouter(
      <OpenTextItem
        body={{ min_words: null, rubric: null, short_answer: true }}
        answer={{ kind: 'open_text', text: '42' }}
        onChange={() => undefined}
        disabled={false}
      />,
    )
    await expect.element(screen.getByRole('textbox')).toHaveValue('42')
    expect(screen.getByRole('textbox').element().tagName).toBe('INPUT')
  })
})
