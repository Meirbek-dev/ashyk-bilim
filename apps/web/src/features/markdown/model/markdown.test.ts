import { describe, expect, test } from 'vite-plus/test'

import { hasRawHtml, markdownPlainText, markdownSummary } from '../index'
import { markdownLosses, markdownShape, roundTripMarkdown } from './round-trip'
import { safeImageUrl, safeUrl, sanitize } from './sanitize'

describe('B-MD-02 B-MD-03 URL rules', () => {
  test('B-MD-02 links: http(s), mailto, relative and anchors only', () => {
    for (const ok of [
      'https://example.com',
      'http://example.com',
      'mailto:a@b.kz',
      '/courses/1',
      '#part',
      './a',
      '../b',
    ])
      expect(safeUrl(ok)).toBe(ok)
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html,<h1>',
      '//evil.com/x',
      '',
      '  ',
      null,
      undefined,
      'vbscript:x',
    ])
      expect(safeUrl(bad)).toBeUndefined()
  })

  test('B-MD-03 images only from platform storage', () => {
    expect(safeImageUrl('/content/platform/a.png')).toBe('/content/platform/a.png')
    expect(safeImageUrl('https://tracker.example/pixel.gif')).toBeUndefined()
    expect(safeImageUrl('javascript:alert(1)')).toBeUndefined()
  })
})

describe('B-MD-04 B-MD-05 HTML', () => {
  test('B-MD-04 raw HTML is detected', () => {
    expect(hasRawHtml('<div>hello</div>')).toBe(true)
    expect(hasRawHtml('**bold** and `code`, 2 < 3')).toBe(false)
  })

  test('B-MD-05 without a DOM sanitize fails closed', () => {
    expect(sanitize('<p>ok</p><script>alert(1)</script>')).toBe('')
  })
})

describe('B-MD-06 plain text', () => {
  test('B-MD-06 strips markup, keeps escaped punctuation literal (UX-030)', () => {
    expect(markdownPlainText('\\*\\*x\\*\\* costs \\$5')).toBe('**x** costs $5')
    expect(markdownPlainText('# Title\n\n- **bold** [link](https://a.kz) `code`\n\n```js\nx\n```')).toBe(
      'Title bold link code',
    )
  })

  test('B-MD-06 summaries cut at a word and end with an ellipsis', () => {
    expect(markdownSummary('short')).toBe('short')
    expect(markdownSummary('слово '.repeat(60), 30)).toBe('слово слово слово слово…')
  })
})

describe('B-MD-07 markdown editor round trip (G-14)', () => {
  const lossless = [
    '# Title\n\nSome **bold**, *italic*, ~~strike~~ and `code`.',
    '- a\n- b\n  - nested\n\n1. one\n2. two',
    '| a | b |\n|---|---|\n| 1 | 2 |',
    '```python\nprint(1)\n```',
    'Inline $x^2$ and block:\n\n$$\n\\int_a^b f(x)\\,dx\n$$',
    '> quote\n\n---\n\n![diagram](/content/a.png) [site](https://example.com)',
    'Цена \\$5, сұрақ: қалай?',
  ]
  for (const markdown of lossless)
    test(`B-MD-07 keeps ${JSON.stringify(markdown.slice(0, 24))}`, () => {
      expect(markdownLosses(markdown).losses).toEqual([])
    })

  test('B-MD-07 raw HTML is not part of the editor document: the loss is reported', () => {
    const { losses, rawHtml } = markdownLosses('<b>raw</b>')
    expect(rawHtml).toBe(true)
    expect(losses.length).toBeGreaterThan(0)
  })

  test('B-MD-07 the round trip is stable', () => {
    const once = roundTripMarkdown('# A\n\n* x\n* y\n\n$$a+b$$')
    expect(roundTripMarkdown(once)).toBe(once)
    expect(markdownShape(once)).toContain('math value=a+b')
  })
})
