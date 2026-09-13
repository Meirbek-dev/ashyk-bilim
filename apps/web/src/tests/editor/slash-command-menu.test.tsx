/** @vitest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'

const mocks = vi.hoisted(() => ({
  runs: [] as string[],
  closeSlashCommand: vi.fn(),
}))

const editor = {
  view: { coordsAtPos: () => ({ top: 10, bottom: 30, left: 10 }) },
  state: { selection: { to: 2 } },
  chain: () => ({ focus: () => ({ deleteRange: () => ({ run: () => undefined }) }) }),
}

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@tiptap/react', () => ({
  useTiptap: () => ({ editor }),
  useEditorState: () => ({ active: true, query: '', from: 1 }),
}))
vi.mock('@/components/Objects/Editor/core/slash-command', () => ({ closeSlashCommand: mocks.closeSlashCommand }))
vi.mock('@/components/Objects/Editor/Toolbar/insert-items', () => ({
  INSERT_CATEGORY_LABELS: { basic: 'basic', media: 'media', interactive: 'interactive' },
  createInsertItems: () =>
    ['first', 'second'].map(id => ({
      id,
      label: id,
      description: `${id} description`,
      icon: null,
      category: 'basic',
      run: () => {
        mocks.runs.push(id)
      },
    })),
}))

import { SlashCommandMenu } from '@/components/Objects/Editor/Toolbar/SlashCommandMenu'

// UX-026: the editor keeps focus while the menu is open; the keys still drive the menu.
describe('slash menu keyboard navigation', () => {
  // jsdom has no layout; cmdk scrolls the selected item into view.
  Element.prototype.scrollIntoView = vi.fn()

  it('ArrowDown moves the selection and Enter inserts the selected item', async () => {
    render(<SlashCommandMenu />)
    const contenteditable = document.createElement('div')
    document.body.append(contenteditable)

    await screen.findByText('second')
    fireEvent.keyDown(contenteditable, { key: 'ArrowDown' })
    fireEvent.keyDown(contenteditable, { key: 'Enter' })

    expect(mocks.runs).toEqual(['second'])
    expect(mocks.closeSlashCommand).toHaveBeenCalled()
  })
})
