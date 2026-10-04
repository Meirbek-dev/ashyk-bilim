import { describe, expect, test } from 'vite-plus/test'

import { blockFileUrl } from './document'
import { clock, fileBlockFor, fileBlockObject } from './file-blocks'

describe('file blocks', () => {
  test('B-EDT-17 a claimed upload is stored in the old shape and served from /content/<key>', () => {
    const stored = fileBlockObject('b1', { id: 'u1', key: 'block-image/u1' }, 'Diagram.Final.PNG')
    expect(stored).toEqual({
      block_uuid: 'b1',
      content: { file_id: 'u1', file_key: 'block-image/u1', file_format: 'png', file_name: 'Diagram.Final.PNG' },
    })
    expect(blockFileUrl(stored)).toBe('/content/block-image/u1')
    expect(fileBlockObject('b2', { id: 'u2', key: 'k' }, 'README').content.file_format).toBe('')
  })

  test('B-EDT-18 a pasted or dropped file becomes the block of its type, anything else is not ours', () => {
    expect(fileBlockFor('image/webp')).toBe('blockImage')
    expect(fileBlockFor('application/pdf')).toBe('blockPDF')
    expect(fileBlockFor('video/mp4')).toBe('blockVideo')
    expect(fileBlockFor('application/zip')).toBeNull()
    expect(fileBlockFor('')).toBeNull()
  })

  test('B-EDT-19 media time reads m:ss, h:mm:ss past an hour, 0:00 before metadata', () => {
    expect(clock(0)).toBe('0:00')
    expect(clock(65.9)).toBe('1:05')
    expect(clock(3725)).toBe('1:02:05')
    expect(clock(Number.NaN)).toBe('0:00')
    expect(clock(Number.POSITIVE_INFINITY)).toBe('0:00')
  })
})
