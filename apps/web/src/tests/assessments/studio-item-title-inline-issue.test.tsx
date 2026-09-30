/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'

// UX-143 (UX-120 pattern): a cleared studio item title is flagged inline
// (`item.title_missing`) under the field instead of surfacing as a raw
// «Validation failed» toast from the autosave PATCH.

vi.mock('next-intl', () => ({
  useTranslations: () => Object.assign((key: string) => key, { has: () => true }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/content-markdown', () => ({ MarkdownEditor: () => null, MarkdownContent: () => null }))
vi.mock('@/features/assessments/studio/components/QuestionInspectorPanel', () => ({ default: () => null }))
vi.mock('@/lib/api-client', () => ({ apiJson: vi.fn() }))
vi.mock('@/features/assessments/studio/context', () => ({
  useAssessmentStudioContext: () => ({
    selectedIssueCode: null,
    setSelectedIssueCode: vi.fn(),
    refresh: vi.fn(async () => {}),
  }),
}))

import BuilderCanvasTab from '@/features/assessments/studio/tabs/BuilderCanvasTab'
import type { EditableItem } from '@/features/assessments/studio/studioTypes'

const item: EditableItem = {
  item_uuid: 'item-1',
  kind: 'CHOICE',
  title: '   ',
  max_score: 10,
  metadata: { section_label: null, difficulty: null, tags: [], outcome_ids: [], estimated_minutes: null },
  body: {
    kind: 'CHOICE',
    prompt: '2+2?',
    options: [
      { id: 'a', text: '4', is_correct: true },
      { id: 'b', text: '5', is_correct: false },
    ],
    multiple: false,
    variant: 'SINGLE_CHOICE',
    explanation: null,
  },
} as unknown as EditableItem

describe('studio item title', () => {
  it('shows the item_title_missing issue inline under the field', () => {
    const noop = async () => {}
    render(
      <BuilderCanvasTab
        assessmentUuid="asm-1"
        items={[]}
        selectedItemUuid="item-1"
        allowedKinds={['CHOICE']}
        itemNoun="Question"
        isEditable
        validationIssues={[]}
        totalPoints={10}
        itemState={item}
        itemSaveState="dirty"
        onSelectItem={() => {}}
        onItemCreated={noop}
        onItemDeleted={noop}
        onItemDuplicated={noop}
        onReorder={noop}
        onItemMetadataChange={noop}
        onItemChange={() => {}}
        renderItemBodyEditor={() => null}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('item_title_missing')
    expect(screen.getByLabelText('titleLabel')).toHaveAttribute('aria-invalid', 'true')
  })
})
