import { describe, expect, test, vi } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import type { ItemAnswer } from '#/shared/api/gen/types.gen'
import { renderInRouter } from '#/shared/components/testing'

import { MatchingItem } from './matching-item'

const option = (text: string) => ({ id: text, text })
const body = { prompt: '', left: ['A', 'B'].map(option), right: ['1', '2'].map(option) }

describe('MatchingItem', () => {
  test('«Без пары» is a pick of its own (an empty right), apart from the «not answered» placeholder', async () => {
    const onChange = vi.fn<(answer: ItemAnswer) => void>()
    const answer: ItemAnswer = { kind: 'matching', matches: [{ left: 'A', right: '1' }] }
    const screen = await renderInRouter(
      <MatchingItem body={body} answer={answer} onChange={onChange} disabled={false} />,
    )
    const second = screen.getByRole('combobox', { name: 'B' })
    await expect.element(second).toHaveDisplayValue(m.attempt_match_pick())
    await second.selectOptions(m.attempt_match_none())
    expect(onChange).toHaveBeenLastCalledWith({
      kind: 'matching',
      matches: [
        { left: 'A', right: '1' },
        { left: 'B', right: '' },
      ],
    })
  })

  test('a stored empty right reads back as «Без пары»', async () => {
    const answer: ItemAnswer = { kind: 'matching', matches: [{ left: 'A', right: '' }] }
    const screen = await renderInRouter(
      <MatchingItem body={body} answer={answer} onChange={() => undefined} disabled={false} />,
    )
    await expect.element(screen.getByRole('combobox', { name: 'A' })).toHaveDisplayValue(m.attempt_match_none())
  })
})
