import { Editor } from '@tiptap/core';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MarkdownEditor } from '@/features/content-markdown';
import { buildEditorExtensions } from '@/features/content-markdown/lib/tiptap-extensions';
import { getMarkdownPreset } from '@/features/content-markdown/presets/presets';

vi.mock('@/features/content-markdown/lib/shiki', () => ({
  highlightCode: vi.fn().mockResolvedValue('<pre><code>const x = 1</code></pre>'),
  getLanguageDisplayName: vi.fn((lang: string) => lang ?? 'Text'),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    const labels: Record<string, string> = {
      'toolbar.label': 'Markdown editor toolbar',
      'toolbar.viewSource': 'Source',
    };
    if (key === 'statusBar.issueToggle') return `${values?.count ?? 0} issues`;
    if (labels[key]) return labels[key];
    return key.split('.').at(-1) ?? key;
  },
}));

describe('MarkdownEditor', () => {
  let editor: Editor | null = null;

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  it('registers code block authoring for code-enabled presets', () => {
    editor = new Editor({
      extensions: buildEditorExtensions({
        config: getMarkdownPreset('codeProblemStatement'),
      }),
      content: 'hello',
    });

    expect(editor.commands.toggleCodeBlock()).toBe(true);
    expect(editor.isActive('codeBlock')).toBe(true);
  });

  it('does not register code block authoring for presets that disallow code blocks', () => {
    editor = new Editor({
      extensions: buildEditorExtensions({
        config: getMarkdownPreset('courseDescription'),
      }),
      content: 'hello',
    });

    expect(editor.schema.nodes.codeBlock).toBeUndefined();
  });

  it('supports source mode editing against the canonical Markdown string', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    function Harness() {
      const [value, setValue] = useState('Initial');
      return (
        <MarkdownEditor
          value={value}
          onChange={(next) => {
            setValue(next);
            onChange(next);
          }}
          preset="questionPrompt"
        />
      );
    }

    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Source' }));
    const source = screen.getByRole('textbox', { name: /markdown source/i });
    await user.clear(source);
    await user.type(source, '## Prompt');

    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith('## Prompt');
    });
  });

  it('reports validation issues to the host surface', () => {
    const onValidationChange = vi.fn();

    render(
      <MarkdownEditor
        value="[unsafe](javascript:alert(1))"
        onChange={vi.fn()}
        preset="questionPrompt"
        onValidationChange={onValidationChange}
      />,
    );

    expect(onValidationChange).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ code: 'link.unsafe' })]),
    );
  });
});
