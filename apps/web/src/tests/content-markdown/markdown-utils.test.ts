import { describe, expect, it } from 'vitest'

import {
  validateMarkdownContent,
  getHighestMarkdownIssueSeverity,
} from '@/features/content-markdown'
import {
  isSafeMarkdownUrl,
  hasRawHtml,
  isMarkdownStructurallyEmpty,
  findUnsafeMarkdownLinks,
} from '@/features/content-markdown'

// ── sanitize utilities ────────────────────────────────────────────────────────

describe('isSafeMarkdownUrl', () => {
  it('accepts https URLs', () => expect(isSafeMarkdownUrl('https://example.com')).toBe(true))
  it('accepts http URLs', () => expect(isSafeMarkdownUrl('http://example.com')).toBe(true))
  it('accepts mailto URLs', () => expect(isSafeMarkdownUrl('mailto:a@b.com')).toBe(true))
  it('accepts relative paths', () => expect(isSafeMarkdownUrl('/foo/bar')).toBe(true))
  it('accepts anchor links', () => expect(isSafeMarkdownUrl('#section')).toBe(true))
  it('rejects javascript: URLs', () => expect(isSafeMarkdownUrl('javascript:alert(1)')).toBe(false))
  it('rejects data: URLs', () =>
    expect(isSafeMarkdownUrl('data:text/html,<h1>hi</h1>')).toBe(false))
  it('rejects empty strings', () => expect(isSafeMarkdownUrl('')).toBe(false))
  it('rejects null', () => expect(isSafeMarkdownUrl(null)).toBe(false))
  it('rejects undefined', () => expect(isSafeMarkdownUrl(undefined)).toBe(false))
})

describe('hasRawHtml', () => {
  it('detects <div>', () => expect(hasRawHtml('<div>hello</div>')).toBe(true))
  it('detects <br />', () => expect(hasRawHtml('<br />')).toBe(true))
  it('does not flag plain markdown', () => expect(hasRawHtml('**bold** and `code`')).toBe(false))
})

describe('isMarkdownStructurallyEmpty', () => {
  it('identifies empty string', () => expect(isMarkdownStructurallyEmpty('')).toBe(true))
  it('identifies whitespace-only', () =>
    expect(isMarkdownStructurallyEmpty('   \n\n  ')).toBe(true))
  it('identifies syntax-only (headers + bullets)', () =>
    expect(isMarkdownStructurallyEmpty('## \n- \n')).toBe(true))
  it('identifies content with text', () => expect(isMarkdownStructurallyEmpty('Hello')).toBe(false))
  it('identifies code fences with content', () =>
    expect(isMarkdownStructurallyEmpty('```\ncode\n```')).toBe(false))
})

describe('findUnsafeMarkdownLinks', () => {
  it('finds javascript: links', () => {
    const links = findUnsafeMarkdownLinks('[x](javascript:void(0))')
    expect(links).toHaveLength(1)
  })
  it('returns empty for safe links', () => {
    const links = findUnsafeMarkdownLinks('[x](https://example.com)')
    expect(links).toHaveLength(0)
  })
  it('finds multiple unsafe links', () => {
    const content = '[a](javascript:a) [b](data:b) [c](https://safe.com)'
    expect(findUnsafeMarkdownLinks(content)).toHaveLength(2)
  })
})

// ── validation ────────────────────────────────────────────────────────────────

describe('validateMarkdownContent', () => {
  it('returns error for required empty content', () => {
    const issues = validateMarkdownContent('', 'questionPrompt', {
      required: true,
    })
    expect(issues.some(i => i.code === 'content.empty')).toBe(true)
  })

  it('does not error for empty optional content', () => {
    const issues = validateMarkdownContent('', 'questionPrompt', {
      required: false,
    })
    expect(issues.some(i => i.code === 'content.empty')).toBe(false)
  })

  it('returns all issues, not just first', () => {
    const longContent = 'x'.repeat(12_001)
    const issues = validateMarkdownContent(longContent, 'questionPrompt')
    expect(issues.length).toBeGreaterThan(0)
  })

  it('detects raw HTML', () => {
    const issues = validateMarkdownContent('<div>bad</div>', 'questionPrompt')
    expect(issues.some(i => i.code === 'html.raw')).toBe(true)
  })

  it('warns about math with unbalanced dollar signs', () => {
    const issues = validateMarkdownContent('$E=mc^2 without closing', 'questionPrompt')
    expect(issues.some(i => i.code === 'math.unbalanced')).toBe(true)
  })

  it('does NOT flag currency as math false positive', () => {
    // $100 and $50 should NOT trigger math.unbalanced
    const issues = validateMarkdownContent('Price is $100 and discount is $50', 'questionPrompt')
    expect(issues.some(i => i.code === 'math.unbalanced')).toBe(false)
  })

  it('does not flag balanced math delimiters', () => {
    const issues = validateMarkdownContent('The formula $E=mc^2$ is famous.', 'questionPrompt')
    expect(issues.some(i => i.code === 'math.unbalanced')).toBe(false)
  })

  it('warns about unclosed code fence', () => {
    const issues = validateMarkdownContent('```python\nprint("hello")', 'questionPrompt')
    expect(issues.some(i => i.code === 'codeFence.unclosed')).toBe(true)
  })

  it('does NOT flag inline code backticks as fence', () => {
    const issues = validateMarkdownContent('Use `foo` and `bar` as names', 'questionPrompt')
    expect(issues.some(i => i.code === 'codeFence.unclosed')).toBe(false)
  })

  it('warns about table column mismatch', () => {
    const content = '| A | B |\n| --- | --- |\n| 1 | 2 | 3 |'
    const issues = validateMarkdownContent(content, 'questionPrompt')
    expect(issues.some(i => i.code === 'table.columnMismatch')).toBe(true)
  })

  it('warns at 90% length', () => {
    // questionPrompt has maxLength: 12_000
    const content = 'x'.repeat(11_000) // > 90% of 12000
    const issues = validateMarkdownContent(content, 'questionPrompt')
    expect(issues.some(i => i.code === 'content.nearLimit')).toBe(true)
  })

  it('errors at > 100% length', () => {
    const content = 'x'.repeat(13_000)
    const issues = validateMarkdownContent(content, 'questionPrompt')
    expect(issues.some(i => i.code === 'content.tooLong')).toBe(true)
  })
})

describe('getHighestMarkdownIssueSeverity', () => {
  it('returns error when any issue is error', () => {
    const issues = [
      { severity: 'warning' as const, code: 'a', message: '' },
      { severity: 'error' as const, code: 'b', message: '' },
    ]
    expect(getHighestMarkdownIssueSeverity(issues)).toBe('error')
  })

  it('returns warning when only warnings', () => {
    const issues = [{ severity: 'warning' as const, code: 'a', message: '' }]
    expect(getHighestMarkdownIssueSeverity(issues)).toBe('warning')
  })

  it('returns null for empty issues', () => {
    expect(getHighestMarkdownIssueSeverity([])).toBeNull()
  })
})
