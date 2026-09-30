/** @vitest-environment jsdom */
/**
 * BUG-263: removing an upload-backed block only drops the node — an undo can
 * still restore it, so nothing is released on the click (the next save that
 * no longer shows the block releases its upload server-side).
 */
import { describe, expect, it, vi } from 'vite-plus/test'
import type { ReactNode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const apiJson = vi.fn()
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/lib/api-client', () => ({ apiJson: (...args: unknown[]) => apiJson(...args) }))
vi.mock('@services/blocks/upload', () => ({
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
  it('drops the node without deleting the block', async () => {
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
    expect(apiJson).not.toHaveBeenCalled()
  })
})
