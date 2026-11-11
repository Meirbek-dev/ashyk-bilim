import { describe, expect, test } from 'vite-plus/test'

import { MAX_FILES, fitting, opensInline, readyAttachments, sendBlocker, type PendingFile } from './attachments'

const file = (name: string, state: 'uploading' | 'ready' | 'failed'): PendingFile => ({
  key: name,
  file: new File(['x'], name),
  progress: state === 'uploading' ? 0.5 : 1,
  upload: state === 'ready' ? { id: `id-${name}`, key: `message-attachment/${name}`, size_bytes: 1 } : null,
  error: state === 'failed' ? 'network' : null,
})

describe('attachments', () => {
  test('a send carries the ready files in their order', () => {
    expect(readyAttachments([file('a.pdf', 'ready'), file('b.pdf', 'uploading'), file('c.png', 'ready')])).toEqual([
      { upload_id: 'id-a.pdf', name: 'a.pdf' },
      { upload_id: 'id-c.png', name: 'c.png' },
    ])
  })

  test('a send waits for text or a file, and for every upload to finish', () => {
    expect(sendBlocker('  ', [])).toBe('empty')
    expect(sendBlocker('hi', [])).toBeNull()
    expect(sendBlocker('', [file('a', 'ready')])).toBeNull()
    expect(sendBlocker('hi', [file('a', 'ready'), file('b', 'uploading')])).toBe('uploading')
    expect(sendBlocker('hi', [file('a', 'failed')])).toBe('failed')
  })

  test('at most five files fit', () => {
    expect(fitting([1, 2, 3], 3)).toEqual([1, 2])
    expect(fitting([1], MAX_FILES)).toEqual([])
  })

  test('images and PDFs open in place, the rest downloads', () => {
    expect(opensInline('image/png')).toBe(true)
    expect(opensInline('application/pdf; charset=binary')).toBe(true)
    expect(opensInline('image/svg+xml')).toBe(false)
    expect(opensInline('application/zip')).toBe(false)
  })
})
