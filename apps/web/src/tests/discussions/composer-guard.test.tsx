/** @vitest-environment jsdom */
// ROUND3-19: a discussion composer asks before leaving only while it holds real text - an editor emptied back to
// `<p></p>`, or an edit back at the text it opened with, lets the reader go.
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'

import { useComposerGuard } from '@/components/discussions/text'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

const leaving = () => {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

describe('useComposerGuard', () => {
  it('holds the page for real text only', () => {
    const { rerender, unmount } = renderHook(({ content, initial }) => useComposerGuard({ content, initial }), {
      initialProps: { content: '', initial: '' },
    })
    expect(leaving()).toBe(false)
    rerender({ content: '<p>Вопрос по заданию</p>', initial: '' })
    expect(leaving()).toBe(true)
    rerender({ content: '<p></p>', initial: '' })
    expect(leaving()).toBe(false)
    rerender({ content: '<p>&nbsp; </p>', initial: '' })
    expect(leaving()).toBe(false)
    // Editing: unchanged text is clean, a change is not.
    rerender({ content: '<p>Старый ответ</p>', initial: '<p>Старый ответ</p>' })
    expect(leaving()).toBe(false)
    rerender({ content: '<p>Новый ответ</p>', initial: '<p>Старый ответ</p>' })
    expect(leaving()).toBe(true)
    unmount()
    expect(leaving()).toBe(false)
  })

  it('guards a component with several composers once, while any of them is dirty', () => {
    const { rerender } = renderHook(drafts => useComposerGuard(...drafts), {
      initialProps: [{ content: '' }, { content: '<p>Пост</p>', initial: '<p>Пост</p>' }],
    })
    expect(leaving()).toBe(false)
    rerender([{ content: '<p>Ответ</p>' }, { content: '<p>Пост</p>', initial: '<p>Пост</p>' }])
    expect(leaving()).toBe(true)
  })
})

describe('hasMeaningfulText on the editor JSON', () => {
  const doc = (...content: unknown[]) => JSON.stringify({ type: 'doc', content })
  it('treats an emptied editor as empty and real text or media as content', async () => {
    const { hasMeaningfulText } = await import('@/components/discussions/text')
    expect(hasMeaningfulText(doc({ type: 'paragraph' }))).toBe(false)
    expect(hasMeaningfulText(doc({ type: 'paragraph', content: [{ type: 'text', text: '   ' }] }))).toBe(false)
    expect(hasMeaningfulText(doc({ type: 'paragraph', content: [{ type: 'hardBreak' }] }))).toBe(false)
    expect(hasMeaningfulText(doc({ type: 'paragraph', content: [{ type: 'text', text: 'Вопрос' }] }))).toBe(true)
    expect(hasMeaningfulText(doc({ type: 'image', attrs: { src: 'x' } }))).toBe(true)
    expect(hasMeaningfulText('<p>Старый HTML-пост</p>')).toBe(true)
  })
})
