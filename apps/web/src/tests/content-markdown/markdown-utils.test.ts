import { describe, expect, it } from 'vitest';

import {
  extractMarkdownPlainText,
  extractMarkdownSummary,
  findUnsafeMarkdownLinks,
  hasRawHtml,
  isMarkdownStructurallyEmpty,
  isSafeMarkdownUrl,
  normalizeMarkdown,
  validateMarkdownContent,
} from '@/features/content-markdown';

describe('content-markdown utilities', () => {
  it('normalizes markdown line endings and preserves meaningful content', () => {
    expect(normalizeMarkdown('## Title\r\n\r\nBody  \r\n')).toBe('## Title\n\nBody');
  });

  it('detects structurally empty markdown', () => {
    expect(isMarkdownStructurallyEmpty('  **   __  ')).toBe(true);
    expect(isMarkdownStructurallyEmpty('```ts\nconsole.log(1)\n```')).toBe(false);
  });

  it('extracts plain summaries without markdown syntax', () => {
    expect(extractMarkdownPlainText('## Intro\n\nUse `python` and read [docs](https://example.com).')).toBe(
      'Intro Use python and read docs.',
    );
    expect(extractMarkdownSummary('## Long\n\nThis course teaches algorithms with practical tasks.', 24)).toBe(
      'Long This course…',
    );
  });

  it('allows only safe markdown links', () => {
    expect(isSafeMarkdownUrl('https://example.com')).toBe(true);
    expect(isSafeMarkdownUrl('/course/abc')).toBe(true);
    expect(isSafeMarkdownUrl('mailto:test@example.com')).toBe(true);
    expect(isSafeMarkdownUrl('javascript:alert(1)')).toBe(false);
    expect(findUnsafeMarkdownLinks('[bad](javascript:alert(1))')).toEqual(['javascript:alert(1']);
  });

  it('validates dangerous and malformed content', () => {
    expect(hasRawHtml('<script>alert(1)</script>')).toBe(true);
    const issues = validateMarkdownContent('[bad](javascript:alert(1))\n```ts', 'questionPrompt', {
      required: true,
    });
    expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(['link.unsafe', 'codeFence.unclosed']));
  });
});
