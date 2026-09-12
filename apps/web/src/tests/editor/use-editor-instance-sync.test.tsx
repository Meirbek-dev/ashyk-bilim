/** @vitest-environment jsdom */

import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'

import { useEditorInstance } from '../../components/Objects/Editor/core/use-editor-instance'

const fakeEditor = vi.hoisted(() => ({
  isDestroyed: false,
  getJSON: () => ({ type: 'doc', content: [{ type: 'paragraph' }] }),
  commands: { setContent: vi.fn() },
}))

vi.mock('@tiptap/react', () => ({
  useEditor: () => fakeEditor,
}))

vi.mock('../../components/Objects/Editor/core/editor-kernel', () => ({
  createEditorExtensions: () => [],
  resolveEditorContent: (content: unknown) => content,
}))

const imageDoc = {
  type: 'doc',
  content: [{ type: 'blockImage', attrs: { blockObject: null, size: { width: 300 }, alignment: 'center' } }],
}

describe('useEditorInstance content sync', () => {
  it('defers setContent out of the effect (node views flushSync on mount)', async () => {
    renderHook(() => useEditorInstance({ preset: 'authoring', content: imageDoc }))

    // Not called synchronously inside the commit phase…
    expect(fakeEditor.commands.setContent).not.toHaveBeenCalled()

    // …but on the next microtask, with the resolved content.
    await Promise.resolve()
    expect(fakeEditor.commands.setContent).toHaveBeenCalledWith(imageDoc, { emitUpdate: false })
  })

  it('skips setContent when the editor already holds the content', async () => {
    fakeEditor.commands.setContent.mockClear()
    renderHook(() => useEditorInstance({ preset: 'authoring', content: fakeEditor.getJSON() }))
    await Promise.resolve()
    expect(fakeEditor.commands.setContent).not.toHaveBeenCalled()
  })
})
