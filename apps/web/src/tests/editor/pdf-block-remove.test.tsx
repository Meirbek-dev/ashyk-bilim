/** @vitest-environment jsdom */
/**
 * UX-160: every upload-backed block releases its upload on removal — the
 * PDF block's remove calls `DELETE blocks/{id}` before dropping the node.
 */
import { describe, expect, it, vi } from 'vite-plus/test'
import type { ReactNode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const deleteBlock = vi.fn(async (_id: string) => {})
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@services/blocks/upload', () => ({
  deleteBlock: (id: string) => deleteBlock(id),
  getBlockFileUrl: () => 'https://media.test/block-pdf/x',
}))
vi.mock('@services/blocks/Pdf/pdf', () => ({ uploadNewPDFFile: vi.fn() }))
vi.mock('@components/Contexts/Editor/EditorContext', () => ({ useEditorProvider: () => ({ isEditable: true }) }))
vi.mock('@/components/Objects/Elements/Modal/Modal', () => ({ default: () => null }))
vi.mock('@/components/ui/resizable', () => ({
  ResizablePanelGroup: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ResizablePanel: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ResizableHandle: () => null,
}))
vi.mock('@tiptap/react', () => ({
  NodeViewWrapper: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}))

import PDFBlockComponent from '@components/Objects/Editor/Extensions/PDF/PDFBlockComponent'

describe('PDF block removal', () => {
  it('deletes the block (releasing its upload) and then the node', async () => {
    globalThis.ResizeObserver ??= class {
      observe() {}
      disconnect() {}
      unobserve() {}
    } as unknown as typeof ResizeObserver
    const deleteNode = vi.fn()
    const props = {
      node: { attrs: { blockObject: { block_uuid: 'b1', content: {} }, size: undefined } },
      extension: { options: { activity: { activity_uuid: 'a1' } } },
      updateAttributes: vi.fn(),
      deleteNode,
    } as unknown as Parameters<typeof PDFBlockComponent>[0]
    render(<PDFBlockComponent {...props} />)
    await userEvent.click(screen.getByTitle('remove'))
    await waitFor(() => expect(deleteNode).toHaveBeenCalled())
    expect(deleteBlock).toHaveBeenCalledWith('b1')
  })
})
