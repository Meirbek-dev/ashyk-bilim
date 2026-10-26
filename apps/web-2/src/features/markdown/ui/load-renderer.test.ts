import { describe, expect, test } from 'vite-plus/test'

import { loadRenderer } from './load-renderer'
import { MarkdownDraft } from './markdown-draft'

describe('loadRenderer', () => {
  test('B-MD-10 a renderer that does not load leaves the plain text instead of an error', async () => {
    await expect(loadRenderer(() => Promise.reject(new TypeError('Failed to fetch')))).resolves.toEqual({
      default: MarkdownDraft,
    })
  })
})
