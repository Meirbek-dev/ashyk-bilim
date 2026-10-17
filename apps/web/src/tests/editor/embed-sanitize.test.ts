import { describe, expect, it } from 'vite-plus/test'

import { sanitizeEmbedCode, sanitizeEmbedUrl } from '@components/Objects/Editor/Extensions/EmbedObjects/embed-sanitize'

describe('embed sanitization', () => {
  it('keeps the iframe attributes video embeds need and drops handlers and script URLs', () => {
    const html = sanitizeEmbedCode(
      '<iframe src="https://player.vimeo.com/video/1" allow="autoplay; fullscreen" allowfullscreen frameborder="0" onload="alert(1)"></iframe>' +
        '<iframe src="javascript:alert(1)"></iframe>',
    )
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const [vimeo, evil] = doc.querySelectorAll('iframe')

    expect(vimeo?.hasAttribute('allowfullscreen')).toBe(true)
    expect(vimeo?.getAttribute('allow')).toBe('autoplay; fullscreen')
    expect(vimeo?.getAttribute('frameborder')).toBe('0')
    expect(vimeo?.hasAttribute('onload')).toBe(false)
    expect(evil?.hasAttribute('src')).toBe(false)
  })

  it('accepts only http(s) embed URLs', () => {
    expect(sanitizeEmbedUrl(' https://www.youtube.com/embed/x ')).toBe('https://www.youtube.com/embed/x')
    expect(sanitizeEmbedUrl('youtube.com/watch?v=x')).toBe('https://youtube.com/watch?v=x')
    expect(sanitizeEmbedUrl('javascript:alert(1)')).toBe('')
    expect(sanitizeEmbedUrl('data:text/html,<script>alert(1)</script>')).toBe('')
    expect(sanitizeEmbedUrl('ftp://example.com/x')).toBe('')
    expect(sanitizeEmbedUrl('')).toBe('')
  })
})
