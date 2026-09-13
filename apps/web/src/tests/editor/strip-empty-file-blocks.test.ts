// UX-058: an image/PDF/video placeholder that never received an upload is
// editor chrome — autosave drops it instead of persisting it.
import { describe, expect, it } from 'vite-plus/test'

import { EMPTY_TIPTAP_DOC, stripEmptyFileBlocks } from '@/components/Objects/Editor/core/editor-content'

const uploaded = { block_uuid: 'b1', content: { file_id: 'f1', file_format: 'webp' } }

describe('stripEmptyFileBlocks', () => {
  it('drops placeholders and keeps uploaded blocks, recursively', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'hi' }] },
        { type: 'blockImage', attrs: { blockObject: null, size: { width: 300 }, alignment: 'center' } },
        { type: 'blockImage', attrs: { blockObject: uploaded, size: { width: 300 }, alignment: 'center' } },
        { type: 'calloutInfo', content: [{ type: 'blockPDF', attrs: { blockObject: null } }] },
        { type: 'blockVideo', attrs: {} },
      ],
    }
    expect(stripEmptyFileBlocks(doc)).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'hi' }] },
        { type: 'blockImage', attrs: { blockObject: uploaded, size: { width: 300 }, alignment: 'center' } },
        { type: 'calloutInfo', content: [] },
      ],
    })
  })

  it('never saves an empty document body and leaves non-docs alone', () => {
    expect(
      stripEmptyFileBlocks({ type: 'doc', content: [{ type: 'blockImage', attrs: { blockObject: null } }] }),
    ).toEqual(EMPTY_TIPTAP_DOC)
    expect(stripEmptyFileBlocks('<p>legacy</p>')).toBe('<p>legacy</p>')
    expect(stripEmptyFileBlocks(null)).toBeNull()
  })
})
