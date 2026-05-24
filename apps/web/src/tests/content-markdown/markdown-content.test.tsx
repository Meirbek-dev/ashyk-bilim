import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MarkdownContent } from '@/features/content-markdown';

describe('MarkdownContent', () => {
  it('renders rich LMS markdown with safe links and tables', () => {
    render(
      <MarkdownContent
        content={'## Task\n\nRead [docs](https://example.com).\n\n| A | B |\n| - | - |\n| 1 | 2 |'}
        mode="taskDescription"
      />,
    );

    expect(screen.getByRole('heading', { name: 'Task' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'docs' })).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('does not make unsafe links clickable', () => {
    render(
      <MarkdownContent
        content="[bad](javascript:alert(1))"
        mode="prompt"
      />,
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('bad')).toBeInTheDocument();
  });

  it('renders fenced code with a copy action', () => {
    render(
      <MarkdownContent
        content={'```ts\nconst answer = 42;\n```'}
        mode="codeProblem"
      />,
    );

    expect(screen.getByText('ts')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy code' })).toBeInTheDocument();
    expect(screen.getByText('const answer = 42;')).toBeInTheDocument();
  });
});
