import { useState } from 'react'
import { expect, test } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser'

import { m } from '#/paraglide/messages'
import { renderInRouter } from '#/shared/components/testing'

import type { Choice } from '../model/items'
import { ChoiceFields } from './choice-fields'

const question: Choice = {
  kind: 'choice',
  prompt: 'Capital?',
  variant: 'single_choice',
  multiple: false,
  explanation: null,
  options: [
    { id: 'a', text: 'Pariss', is_correct: true },
    { id: 'b', text: 'Rome', is_correct: false },
  ],
}

let saved: Choice = question

function Harness({ mode = 'wording' }: { mode?: 'all' | 'wording' }) {
  const [body, setBody] = useState(question)
  return (
    <ChoiceFields
      body={body}
      mode={mode}
      onChange={next => {
        saved = next
        setBody(next)
      }}
    />
  )
}

test('B-ASM-31 an answered live test takes option wording, never the correct mark, the variant or the option list', async () => {
  const screen = await renderInRouter(<Harness />)
  const first = screen.getByRole('textbox', { name: m.assessments_option_text({ number: 1 }) })
  await expect.element(first).toBeEnabled()
  await userEvent.fill(first, 'Paris')
  await expect.poll(() => saved.options?.[0]?.text).toBe('Paris')
  expect(saved.options?.map(option => [option.id, option.text, option.is_correct])).toEqual([
    ['a', 'Paris', true],
    ['b', 'Rome', false],
  ])
  await expect.element(screen.getByRole('radio', { name: m.assessments_option_correct({ number: 2 }) })).toBeDisabled()
  await expect.element(screen.getByRole('combobox', { name: m.assessments_field_variant() })).toBeDisabled()
  await expect.element(screen.getByRole('button', { name: m.assessments_option_remove({ number: 1 }) })).toBeDisabled()
  await expect.element(screen.getByRole('button', { name: m.assessments_option_add() })).not.toBeInTheDocument()
})

test('B-ASM-15 «Добавить вариант» puts the cursor in the new option, not on the button', async () => {
  const screen = await renderInRouter(<Harness mode="all" />)
  await userEvent.click(screen.getByRole('button', { name: m.assessments_option_add() }))
  const added = screen.getByRole('textbox', { name: m.assessments_option_text({ number: 3 }) })
  await expect.element(added).toHaveFocus()
  await userEvent.keyboard('Berlin')
  await expect.poll(() => saved.options?.[2]?.text).toBe('Berlin')
  // Typing elsewhere afterwards keeps the cursor where it is.
  await userEvent.click(screen.getByRole('textbox', { name: m.assessments_option_text({ number: 1 }) }))
  await userEvent.keyboard('!')
  await expect.element(screen.getByRole('textbox', { name: m.assessments_option_text({ number: 1 }) })).toHaveFocus()
})
