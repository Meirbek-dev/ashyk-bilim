import { describe, expect, test } from 'vite-plus/test'

import { framePath } from '#/shared/components/pdf-frame'

import { blockFileUrl } from './document'

const block = (key: string) => ({ block_uuid: 'b', content: { file_key: key } })

describe('B-EDT-22 block files stay under /content/', () => {
  test('B-EDT-22 a stored key is encoded per segment; traversal, query and control characters are no file', () => {
    expect(blockFileUrl(block('block-pdf/0199a8d5.pdf'))).toBe('/content/block-pdf/0199a8d5.pdf')
    expect(blockFileUrl(block('курс/файл 1.pdf'))).toBe(
      `/content/${encodeURIComponent('курс')}/${encodeURIComponent('файл 1.pdf')}`,
    )
    expect(blockFileUrl({ content: { file_id: 'f1', file_format: 'png' } })).toBe('/content/f1.png')
    for (const key of [
      '../ab-private/k.html?X-Amz-Signature=s&response-content-disposition=inline',
      'a/../../ab-private/k.html',
      '/ab-private/k.html',
      'a\\..\\b',
      'a\\b.pdf',
      'k.pdf?x=1',
      'k.pdf#x',
      'a//b',
      'a/',
      '%2e%2e/ab-private/k.html',
      '%2E%2E%2Fab-private',
      'a%5cb',
      'k\u0000.pdf',
      'k\n.pdf',
    ]) {
      expect(blockFileUrl(block(key))).toBeNull()
    }
  })

  test('B-EDT-22 a PDF frame shows our storage and API paths only', () => {
    expect(framePath('/content/block-pdf/k.pdf')).toBe('/content/block-pdf/k.pdf')
    expect(framePath('/ab-private/k.pdf?X-Amz-Credential=a%2Fb&X-Amz-Signature=s')).toBe(
      '/ab-private/k.pdf?X-Amz-Credential=a%2Fb&X-Amz-Signature=s',
    )
    expect(framePath('/api/v2/certifications/c1/preview.pdf?lang=ru')).toBe(
      '/api/v2/certifications/c1/preview.pdf?lang=ru',
    )
    for (const src of [
      '/content/../ab-private/k.html',
      '/content/%2e%2e/ab-private/k.html',
      '/content/%2E%2E%2Fx',
      '/content\\..\\x',
      '/content/a\\b.pdf',
      '//evil.example/content/x.pdf',
      'https://evil.example/content/x.pdf',
      'content/x.pdf',
      '/courses/1',
      'javascript:alert(1)',
    ]) {
      expect(framePath(src)).toBeNull()
    }
  })
})
