import { describe, expect, test } from 'vite-plus/test'

import { checkUpload } from './upload'

const MB = 1024 * 1024

describe('upload pre-check', () => {
  test('a file over the purpose cap is too large; the cap is inclusive', () => {
    expect(checkUpload({ size: 10 * MB, type: 'image/png' }, 'course-thumbnail')).toBeNull()
    expect(checkUpload({ size: 10 * MB + 1, type: 'image/png' }, 'course-thumbnail')).toEqual({
      kind: 'too-large',
      maxBytes: 10 * MB,
    })
    expect(checkUpload({ size: 6 * MB, type: 'image/png' }, 'avatar')).toMatchObject({ kind: 'too-large' })
  })

  test('the type must be on the purpose allowlist exactly; SVG is never an image here', () => {
    expect(checkUpload({ size: 1, type: 'image/svg+xml' }, 'block-image')).toMatchObject({ kind: 'wrong-type' })
    expect(checkUpload({ size: 1, type: 'application/pdf' }, 'block-pdf')).toBeNull()
    expect(checkUpload({ size: 1, type: 'video/mp4' }, 'block-pdf')).toMatchObject({ kind: 'wrong-type' })
  })

  test('a file submission takes any type', () => {
    expect(checkUpload({ size: 1, type: 'application/zip' }, 'file-submission')).toBeNull()
    expect(checkUpload({ size: 1, type: '' }, 'file-submission')).toBeNull()
  })
})
