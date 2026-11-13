import { useState } from 'react'
import { expect, test } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser'

import { m } from '#/paraglide/messages'
import { renderInRouter } from '#/shared/components/testing'

import type { MatchingBody } from '#/shared/api/gen/types.gen'

import { MatchingFields } from './matching-fields'

type Matching = MatchingBody & { kind: 'matching' }

test('a matching question names its pairs and says which side is the answer key', async () => {
  const screen = await renderInRouter(
    <MatchingFields
      body={{ kind: 'matching', prompt: 'Match', pairs: [{ left: '', right: '' }], explanation: null }}
      mode="all"
      onChange={() => {}}
    />,
  )
  await expect.element(screen.getByRole('group', { name: m.assessments_pairs_legend() })).toBeVisible()
  await expect.element(screen.getByText(m.assessments_pairs_hint())).toBeVisible()
  await expect
    .element(screen.getByPlaceholder(m.assessments_pair_left({ number: 1 })))
    .toHaveAccessibleName(m.assessments_pair_left({ number: 1 }))
})

test('a left value can go with nothing, and distractors join the right column', async () => {
  let saved: Matching | null = null
  function Harness() {
    const [body, setBody] = useState<Matching>({
      kind: 'matching',
      prompt: 'Match',
      pairs: [{ left: 'int', right: 'number' }],
      explanation: null,
    })
    return (
      <MatchingFields
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
  await userEvent.click(screen.getByRole('checkbox', { name: m.assessments_pair_unpaired({ number: 1 }) }))
  await expect.poll(() => saved?.pairs[0]?.right).toBeNull()
  await expect.element(screen.getByRole('textbox', { name: m.assessments_pair_right({ number: 1 }) })).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: m.assessments_distractor_add() }))
  const distractor = screen.getByRole('textbox', { name: m.assessments_distractor_row({ number: 1 }) })
  await expect.element(distractor).toHaveFocus()
  await userEvent.keyboard('char')
  await expect.poll(() => saved?.distractors).toEqual(['char'])
  await userEvent.click(screen.getByRole('checkbox', { name: m.assessments_pair_unpaired({ number: 1 }) }))
  await expect.poll(() => saved?.pairs[0]?.right).toBe('')
})
