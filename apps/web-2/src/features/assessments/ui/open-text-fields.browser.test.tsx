import { useState } from 'react'
import { expect, test } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser'

import { m } from '#/paraglide/messages'
import type { OpenTextBody } from '#/shared/api/gen/types.gen'
import { renderInRouter } from '#/shared/components/testing'

import { OpenTextFields } from './open-text-fields'

type OpenText = OpenTextBody & { kind: 'open_text' }

test('a short answer is checked against the accepted answers, with the case when asked', async () => {
  let saved: OpenText | null = null
  function Harness() {
    const [body, setBody] = useState<OpenText>({ kind: 'open_text', prompt: '2 + 2', min_words: null, rubric: null })
    return (
      <OpenTextFields
        body={body}
        mode="all"
        onChange={next => {
          saved = next
          setBody(next)
        }}
      />
    )
  }
  const screen = await renderInRouter(<Harness />)
  await expect.element(screen.getByRole('textbox', { name: m.assessments_field_min_words() })).toBeVisible()
  await userEvent.click(screen.getByRole('switch', { name: m.assessments_short_answer() }))
  await expect.poll(() => saved?.short_answer).toBe(true)
  await expect.element(screen.getByRole('textbox', { name: m.assessments_field_min_words() })).not.toBeInTheDocument()
  await userEvent.fill(screen.getByRole('textbox', { name: m.assessments_accepted_row({ number: 1 }) }), '4')
  await userEvent.click(screen.getByRole('button', { name: m.assessments_accepted_add() }))
  await userEvent.keyboard('four')
  await userEvent.click(screen.getByRole('checkbox', { name: m.assessments_case_sensitive() }))
  await expect.poll(() => saved).toMatchObject({ accepted_answers: ['4', 'four'], case_sensitive: true })
})
