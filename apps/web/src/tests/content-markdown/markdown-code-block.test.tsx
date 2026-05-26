import { describe, expect, it, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MarkdownCodeBlock } from '@/features/content-markdown';

// Mock navigator.clipboard
const mockWriteText = vi.fn().mockResolvedValue(undefined);
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: mockWriteText },
  writable: true,
  configurable: true,
});

// Mock Shiki
vi.mock('@/features/content-markdown/lib/shiki', () => ({
  highlightCode: vi.fn().mockResolvedValue('<pre><code>console.log("hi")</code></pre>'),
  getLanguageDisplayName: vi.fn((lang: string | undefined) => {
    const MAP: Record<string, string> = {
      typescript: 'TypeScript',
      javascript: 'JavaScript',
      python: 'Python',
      diff: 'Diff',
    };
    return lang ? (MAP[lang] ?? lang.charAt(0).toUpperCase() + lang.slice(1)) : 'Text';
  }),
}));

describe('MarkdownCodeBlock', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders language display name in header', async () => {
    render(
      <MarkdownCodeBlock
        code="const x = 1"
        language="typescript"
      />,
    );
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
  });

  it('shows Text as fallback when no language', () => {
    render(<MarkdownCodeBlock code="some text" />);
    expect(screen.getByText('Text')).toBeInTheDocument();
  });

  it('shows fallback pre while Shiki loads', () => {
    // highlightCode is mocked but resolves async — we check before resolve
    const { container } = render(
      <MarkdownCodeBlock
        code="const x = 1"
        language="typescript"
      />,
    );
    expect(container.querySelector('pre')).toBeInTheDocument();
  });

  it('shows highlighted HTML after Shiki resolves', async () => {
    const { container } = render(
      <MarkdownCodeBlock
        code="const x = 1"
        language="typescript"
      />,
    );
    await waitFor(() => {
      // The mocked HTML contains <pre> from the mocked highlighter
      expect(container.innerHTML).toContain('console.log("hi")');
    });
  });

  it('renders copy button', () => {
    render(
      <MarkdownCodeBlock
        code="hello"
        language="text"
      />,
    );
    expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument();
  });

  it('copies code to clipboard on copy button click', async () => {
    render(
      <MarkdownCodeBlock
        code="const x = 1"
        language="typescript"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /copy/i }));
    await waitFor(() => expect(mockWriteText).toHaveBeenCalledWith('const x = 1'));
  });

  it('shows check icon after copying', async () => {
    const user = userEvent.setup({ writeToClipboard: false });
    render(
      <MarkdownCodeBlock
        code="const x = 1"
        language="typescript"
      />,
    );
    await user.click(screen.getByRole('button', { name: /copy/i }));
    // After clicking, the copied state should show a Check icon
    // We verify that the Copy button no longer shows "Copy" (it shows "Copied" via aria-label change)
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /copy code/i })).not.toBeInTheDocument();
    });
  });

  it('renders compact mode with reduced padding', () => {
    const { container } = render(
      <MarkdownCodeBlock
        code="x"
        compact
      />,
    );
    expect(container.firstElementChild?.className).toContain('my-1.5');
  });
});
