import { describe, expect, test } from 'vite-plus/test'

import { withOutline } from './outline'

const heading = (level: number, text: string, id?: string) => ({
  type: 'heading',
  attrs: { level, ...(id ? { id } : {}) },
  content: [{ type: 'text', text }],
})

describe('outline', () => {
  test('B-EDT-26 headings get anchor ids (stored ones kept, duplicates numbered) and list in order', () => {
    const { doc, outline } = withOutline({
      type: 'doc',
      content: [
        heading(1, 'Введение', 'intro'),
        { type: 'paragraph', content: [{ type: 'text', text: 'x' }] },
        heading(2, 'Циклы'),
        { type: 'callout', content: [heading(3, 'Циклы')] },
      ],
    })
    expect(outline).toEqual([
      { id: 'intro', text: 'Введение', level: 1 },
      { id: 'heading-циклы', text: 'Циклы', level: 2 },
      { id: 'heading-циклы-2', text: 'Циклы', level: 3 },
    ])
    expect(doc.content[2]?.attrs?.['id']).toBe('heading-циклы')
    expect(doc.content[3]?.content?.[0]?.attrs?.['id']).toBe('heading-циклы-2')
  })
})
