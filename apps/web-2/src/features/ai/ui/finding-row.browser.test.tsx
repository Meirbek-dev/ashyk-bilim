import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import { renderInRouter } from '#/shared/components/testing'

import { FindingRow } from './finding-row'

const props = {
  courseId: '0190a5d2-0000-7000-8000-0000000000c1',
  analysisId: '0190a5d2-0000-7000-8000-0000000000c2',
  findingId: 'finding-0',
  recommendation: { title: 'Добавьте практику' },
}

const render = (review: Parameters<typeof FindingRow>[0]['review']) =>
  renderInRouter(
    <QueryClientProvider client={new QueryClient()}>
      <ol>
        <FindingRow {...props} review={review} />
      </ol>
    </QueryClientProvider>,
  )

describe('FindingRow', () => {
  test('B-AI-28 a judged recommendation shows its verdict instead of the buttons', async () => {
    const judged = await render({
      action: 'dismissed',
      note: null,
      reviewed_at: 1_760_000_000,
      reviewed_by_user_id: '0190a5d2-0000-7000-8000-0000000000c3',
    })
    await expect.element(judged.getByText(m.ai_finding_state_dismissed())).toBeVisible()
    expect(judged.getByRole('button', { name: m.ai_finding_accepted() }).elements()).toHaveLength(0)
  })

  test('B-AI-14 an unjudged recommendation offers the verdict buttons', async () => {
    const open = await render(undefined)
    await expect.element(open.getByRole('button', { name: m.ai_finding_accepted() })).toBeVisible()
  })
})
