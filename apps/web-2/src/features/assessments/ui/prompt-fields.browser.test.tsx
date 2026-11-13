import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { expect, test } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser'

import { m } from '#/paraglide/messages'
import type { ChoiceBody } from '#/shared/api/gen/types.gen'
import { renderInRouter } from '#/shared/components/testing'

import { AssessmentIdContext } from './media-picture'
import { PromptFields } from './prompt-fields'

const imported: ChoiceBody = {
  prompt: 'List<String> a;\n    *x*',
  prompt_format: 'plain',
  media: [{ upload_id: '0193a9c2-6f7e-7c3a-9d2e-1f2a3b4c5d6e', width: 640, height: 480, alt: 'Схема' }],
  variant: 'single_choice',
  explanation: null,
}

test('a plain prompt is edited as typed; its picture is shown, described and removed', async () => {
  let saved = imported
  function Harness() {
    const [body, setBody] = useState(imported)
    return (
      <QueryClientProvider client={new QueryClient()}>
        <AssessmentIdContext value="a1">
          <PromptFields
            body={body}
            mode="all"
            onChange={next => {
              saved = next
              setBody(next)
            }}
          />
        </AssessmentIdContext>
      </QueryClientProvider>
    )
  }
  const screen = await renderInRouter(<Harness />)
  await expect.element(screen.getByRole('textbox', { name: m.assessments_field_prompt() })).toHaveValue(imported.prompt)
  await expect.element(screen.getByRole('combobox', { name: m.assessments_field_prompt_format() })).toHaveValue('plain')
  const image = screen.getByRole('img', { name: 'Схема' })
  await expect
    .element(image)
    .toHaveAttribute('src', '/api/v2/assessments/a1/media/0193a9c2-6f7e-7c3a-9d2e-1f2a3b4c5d6e')
  await expect.element(image).toHaveAttribute('width', '640')
  const name = m.assessments_media_name({ number: 1 })
  const alt = screen.getByRole('textbox', { name: m.assessments_media_alt({ name }) })
  await userEvent.fill(alt, 'Схема классов')
  await expect.poll(() => saved.media?.[0]?.alt).toBe('Схема классов')
  // An emptied description is left out, as the server stores it.
  await userEvent.clear(alt)
  await expect
    .poll(() => saved.media?.[0])
    .toEqual({ upload_id: imported.media?.[0]?.upload_id, width: 640, height: 480 })
  await userEvent.click(screen.getByRole('button', { name: m.assessments_media_remove({ name }) }))
  await expect.poll(() => saved.media).toEqual([])
  await expect.element(screen.getByRole('button', { name: m.assessments_media_add() })).toBeVisible()
  expect(saved.prompt_format).toBe('plain')
})
