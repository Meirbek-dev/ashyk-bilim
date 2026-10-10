import { describe, expect, test } from 'vite-plus/test'

import { checkUpload, uploadAccept, uploadType } from './upload'

const MB = 1024 * 1024

describe('upload pre-check', () => {
  test('videos accept 2 GB exactly and reject one byte more', () => {
    expect(checkUpload({ size: 2048 * MB, type: 'video/mp4' }, 'block-video')).toBeNull()
    expect(checkUpload({ size: 2048 * MB + 1, type: 'video/mp4' }, 'block-video')).toEqual({
      kind: 'too-large',
      maxBytes: 2048 * MB,
    })
  })

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

  test('a resource narrows the purpose: its types and a lower cap, never a higher one', () => {
    const limits = { mimes: ['application/pdf'], maxBytes: 5 * MB }
    expect(checkUpload({ size: 1, type: 'application/pdf' }, 'file-submission', limits)).toBeNull()
    expect(checkUpload({ size: 1, type: 'image/png' }, 'file-submission', limits)).toMatchObject({ kind: 'wrong-type' })
    expect(checkUpload({ size: 6 * MB, type: 'application/pdf' }, 'file-submission', limits)).toEqual({
      kind: 'too-large',
      maxBytes: 5 * MB,
    })
    expect(checkUpload({ size: 101 * MB, type: 'x/y' }, 'file-submission', { maxBytes: 500 * MB })).toEqual({
      kind: 'too-large',
      maxBytes: 100 * MB,
    })
    expect(checkUpload({ size: 1, type: 'x/y' }, 'file-submission', { mimes: [], maxBytes: null })).toBeNull()
  })
})

describe('declared type', () => {
  test('what Chromium on Windows reports maps to the type the server policy matches', () => {
    expect(uploadType({ name: 'lecture.mkv', type: 'video/matroska' })).toBe('video/x-matroska')
    expect(uploadType({ name: 'lecture.MKV', type: '' })).toBe('video/x-matroska')
    expect(uploadType({ name: 'IMG_0001.MOV', type: 'video/quicktime' })).toBe('video/quicktime')
    expect(uploadType({ name: 'essay.docx', type: 'application/msword' })).toBe('application/msword')
    expect(uploadType({ name: 'noext', type: '' })).toBe('')
    expect(checkUpload({ name: 'lecture.mkv', size: 1, type: 'video/matroska' }, 'block-video')).toBeNull()
  })

  test('an empty file is refused before any request', () => {
    expect(checkUpload({ size: 0, type: 'video/mp4' }, 'block-video')).toEqual({ kind: 'empty' })
    expect(checkUpload({ size: 0, type: '' }, 'file-submission')).toEqual({ kind: 'empty' })
  })

  test('a video lesson takes only what browsers play; the picker lists the extensions too', () => {
    expect(checkUpload({ name: 'old.avi', size: 1, type: 'video/avi' }, 'block-video')).toMatchObject({
      kind: 'wrong-type',
    })
    expect(uploadAccept('block-video')).toContain('.mkv')
    expect(uploadAccept('block-video')).not.toContain('avi')
    expect(uploadAccept('file-submission')).toBe('')
  })
})
