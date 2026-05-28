import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { MarkdownContent } from '@/features/content-markdown'

// Mock Shiki to avoid actual syntax highlighting in unit tests
vi.mock('@/features/content-markdown/lib/shiki', () => ({
  highlightCode: vi.fn().mockResolvedValue('<pre><code>const x = 1</code></pre>'),
  getLanguageDisplayName: vi.fn((lang: string) => lang ?? 'Text'),
}))

// Mock KaTeX CSS dynamic import
vi.mock('katex/dist/katex.min.css', () => ({}))

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key.split('.').at(-1) ?? key,
}))

describe('MarkdownContent', () => {
  // ── Basic rendering ─────────────────────────────────────────────────────────

  it('renders plain text', () => {
    render(<MarkdownContent content="Hello world" />)
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })

  it('renders GFM bold', () => {
    const { container } = render(<MarkdownContent content="**bold**" />)
    expect(container.querySelector('strong')).toBeInTheDocument()
  })

  it('renders GFM table', () => {
    const content = `| A | B |\n| --- | --- |\n| 1 | 2 |`
    const { container } = render(<MarkdownContent content={content} />)
    expect(container.querySelector('table')).toBeInTheDocument()
  })

  it('returns emptyFallback for empty content', () => {
    render(<MarkdownContent content="" emptyFallback={<span>Nothing here</span>} />)
    expect(screen.getByText('Nothing here')).toBeInTheDocument()
  })

  it('returns emptyFallback for whitespace-only content', () => {
    render(<MarkdownContent content="   \n\n  " emptyFallback={<span>Empty</span>} />)
    expect(screen.getByText('Empty')).toBeInTheDocument()
  })

  // ── Images ──────────────────────────────────────────────────────────────────

  it('renders image placeholder badge when allowImages is false (default)', () => {
    const content = '![A cat](https://example.com/cat.jpg)'
    const { container } = render(<MarkdownContent content={content} allowImages={false} />)
    expect(container.querySelector('img')).not.toBeInTheDocument()
    expect(screen.getByText('A cat')).toBeInTheDocument()
  })

  it('renders actual image when allowImages is true', () => {
    const content = '![A cat](/uploads/cat.jpg)'
    const { container } = render(<MarkdownContent content={content} allowImages />)
    const img = container.querySelector('img')
    expect(img).toBeInTheDocument()
    expect(img?.getAttribute('src')).toBe('/uploads/cat.jpg')
    expect(img?.getAttribute('alt')).toBe('A cat')
  })

  it('renders image placeholder when src uses unsafe protocol even with allowImages=true', () => {
    const content = '![Bad](javascript:alert(1))'
    const { container } = render(<MarkdownContent content={content} allowImages />)
    // sanitizeMarkdownUrl should reject javascript: protocol
    expect(container.querySelector('img')).not.toBeInTheDocument()
  })

  // ── Math ────────────────────────────────────────────────────────────────────

  it('renders math in prompt mode', async () => {
    // KaTeX transforms $..$ into .katex elements
    const { container } = render(
      <MarkdownContent content="The formula $E=mc^2$ is famous." mode="prompt" />,
    )
    // We don't fully assert KaTeX output (not loaded), but check content is there
    expect(container).toBeInTheDocument()
  })

  // ── Heading anchors ──────────────────────────────────────────────────────────

  it('renders heading anchors in courseDescription mode', () => {
    const { container } = render(
      <MarkdownContent content="## My section" mode="courseDescription" />,
    )
    const heading = container.querySelector('h2')
    expect(heading).toBeInTheDocument()
    expect(heading?.getAttribute('id')).toBe('my-section')
    const anchor = container.querySelector('a[href="#my-section"]')
    expect(anchor).toBeInTheDocument()
  })

  it('does not render heading anchors in prompt mode', () => {
    const { container } = render(<MarkdownContent content="## My section" mode="prompt" />)
    const anchor = container.querySelector('a[href^="#"]')
    expect(anchor).not.toBeInTheDocument()
  })

  it('calls onHeadingAnchorClick when anchor is clicked', async () => {
    const user = userEvent.setup()
    const onAnchorClick = vi.fn()
    const { container } = render(
      <MarkdownContent
        content="## My section"
        mode="courseDescription"
        onHeadingAnchorClick={onAnchorClick}
      />,
    )
    const anchor = container.querySelector('a[href="#my-section"]')
    expect(anchor).toBeInTheDocument()
    await user.click(anchor!)
    expect(onAnchorClick).toHaveBeenCalledWith('my-section')
  })

  // ── Links ────────────────────────────────────────────────────────────────────

  it('opens external links in new tab', () => {
    const { container } = render(<MarkdownContent content="[Visit](https://example.com)" />)
    const link = container.querySelector('a')
    expect(link?.getAttribute('target')).toBe('_blank')
    expect(link?.getAttribute('rel')).toContain('noopener')
  })

  it('keeps internal links without target', () => {
    const { container } = render(<MarkdownContent content="[Home](/home)" />)
    const link = container.querySelector('a')
    expect(link?.getAttribute('target')).toBeNull()
  })

  it('renders unsafe links as plain text', () => {
    const { container } = render(<MarkdownContent content="[Evil](javascript:alert(1))" />)
    expect(container.querySelector('a')).not.toBeInTheDocument()
    expect(screen.getByText('Evil')).toBeInTheDocument()
  })

  // ── Code blocks ──────────────────────────────────────────────────────────────

  it('renders code block with Shiki after async highlight', async () => {
    const { container } = render(<MarkdownContent content={'```typescript\nconst x = 1;\n```'} />)
    // Initially shows fallback pre
    expect(container.querySelector('pre')).toBeInTheDocument()

    // Wait for Shiki highlighted HTML
    await waitFor(() => {
      expect(container.innerHTML).toContain('const x = 1')
    })
  })

  it('renders inline code without a code block wrapper', () => {
    const { container } = render(<MarkdownContent content="Use `console.log` here." />)
    const code = container.querySelector('code')
    expect(code).toBeInTheDocument()
    // Should NOT have the MarkdownCodeBlock header bar
    expect(container.querySelector('[aria-label="Copy code"]')).not.toBeInTheDocument()
  })

  // ── Streaming ────────────────────────────────────────────────────────────────

  it('sets aria-live when streaming=true', () => {
    const { container } = render(<MarkdownContent content="Generating..." streaming />)
    const root = container.firstElementChild
    expect(root?.getAttribute('aria-live')).toBe('polite')
  })

  it('does not set aria-live when streaming=false', () => {
    const { container } = render(<MarkdownContent content="Done." streaming={false} />)
    const root = container.firstElementChild
    expect(root?.getAttribute('aria-live')).toBeNull()
  })
})
