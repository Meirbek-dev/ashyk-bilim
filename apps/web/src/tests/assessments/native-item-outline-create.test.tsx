/** @vitest-environment jsdom */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vite-plus/test'

// "New question → Choice" in the studio outline: the Base UI menu item fires
// `onClick` (not `onSelect`, which was a dead prop), and the create body is the
// v2 `CreateItemRequest` — `{title, max_score, body}` with a lowercase-tagged
// body — rather than the uppercase editor state, which the API 422s.

const mocks = vi.hoisted(() => ({
  apiJson: vi.fn(),
  refresh: vi.fn(async () => {}),
  setSelectedItemUuid: vi.fn(),
}))

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/api-client', () => ({ apiJson: mocks.apiJson }))
vi.mock('@/features/assessments/studio/context', () => ({
  useAssessmentStudioContext: () => ({
    assessment: { assessment_uuid: 'asm-1' },
    items: [],
    selectedItemUuid: null,
    setSelectedItemUuid: mocks.setSelectedItemUuid,
    refresh: mocks.refresh,
    isEditable: true,
    totalPoints: 0,
    validationIssues: [],
  }),
}))

import { NativeItemOutline } from '@/features/assessments/studio/components/NativeItemOutline'

describe('NativeItemOutline create item', () => {
  it('POSTs the v2 create body from the menu item click and selects the created item', async () => {
    mocks.apiJson.mockResolvedValue({ id: 'item-9' })
    const user = userEvent.setup()
    render(<NativeItemOutline allowedKinds={['CHOICE', 'MATCHING']} itemNoun="Question" />)

    await user.click(screen.getByRole('button', { name: 'newQuestion' }))
    await user.click(await screen.findByRole('menuitem', { name: /choice/i }))

    await waitFor(() => expect(mocks.apiJson).toHaveBeenCalledTimes(1))
    const [path, init] = mocks.apiJson.mock.calls[0] as [string, { method: string; body: string }]
    expect(path).toBe('assessments/asm-1/items')
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body)
    expect(Object.keys(body).toSorted()).toEqual(['body', 'max_score', 'title'])
    expect(body.body).toMatchObject({ kind: 'choice', variant: 'single_choice', multiple: false })
    expect(body.body.options).toHaveLength(2)

    await waitFor(() => expect(mocks.setSelectedItemUuid).toHaveBeenCalledWith('item-9'))
  })
})
