import { expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import { renderInRouter } from '#/shared/components/testing'

import { MatchingFields } from './matching-fields'

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
