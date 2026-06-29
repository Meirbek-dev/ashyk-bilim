import { Editor } from '@tiptap/core'
import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { MarkdownEditor } from '@/features/content-markdown'
import { buildEditorExtensions } from '@/features/content-markdown/lib/tiptap-extensions'
import { getMarkdownPreset } from '@/features/content-markdown/presets/presets'

vi.mock('@/features/content-markdown/lib/shiki', () => ({
  highlightCode: vi.fn().mockResolvedValue('<pre><code>const x = 1</code></pre>'),
  getLanguageDisplayName: vi.fn((lang: string) => lang ?? 'Text'),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    const labels: Record<string, string> = {
      'toolbar.label': 'Markdown editor toolbar',
      'toolbar.viewSource': 'Source',
    }
    if (key === 'statusBar.issueToggle') return `${values?.count ?? 0} issues`
    if (labels[key]) return labels[key]
    return key.split('.').at(-1) ?? key
  },
}))

describe('MarkdownEditor', () => {
  let editor: Editor | null = null

  afterEach(() => {
    editor?.destroy()
    editor = null
  })

  it('registers code block authoring for code-enabled presets', () => {
    editor = new Editor({
      extensions: buildEditorExtensions({
        config: getMarkdownPreset('codeProblemStatement'),
      }),
      content: 'hello',
    })

    expect(editor.commands.toggleCodeBlock()).toBe(true)
    expect(editor.isActive('codeBlock')).toBe(true)
  })

  it('does not register code block authoring for presets that disallow code blocks', () => {
    editor = new Editor({
      extensions: buildEditorExtensions({
        config: getMarkdownPreset('courseDescription'),
      }),
      content: 'hello',
    })

    expect(editor.schema.nodes.codeBlock).toBeUndefined()
  })

  it('supports source mode editing against the canonical Markdown string', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    function Harness() {
      const [value, setValue] = useState('Initial')
      return (
        <MarkdownEditor
          value={value}
          onChange={next => {
            setValue(next)
            onChange(next)
          }}
          preset="questionPrompt"
        />
      )
    }

    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Source' }))
    const source = screen.getByRole('textbox', { name: /markdown source/i })
    await user.clear(source)
    await user.type(source, '## Prompt')

    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith('## Prompt')
    })
  })

  it('reports validation issues to the host surface', () => {
    const onValidationChange = vi.fn()

    render(
      <MarkdownEditor
        value="[unsafe](javascript:alert(1))"
        onChange={vi.fn()}
        preset="questionPrompt"
        onValidationChange={onValidationChange}
      />,
    )

    expect(onValidationChange).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ code: 'link.unsafe' })]),
    )
  })

  it('does not display visual errors when not dirty, but shows them after user edits', async () => {
    const user = userEvent.setup()

    function Harness() {
      const [value, setValue] = useState('')
      return <MarkdownEditor value={value} onChange={setValue} preset="questionPrompt" required />
    }

    const { container } = render(<Harness />)

    // The editor has empty/required issues but since it is not dirty, it should NOT render any issues button in the status bar
    expect(screen.queryByRole('button', { name: /issues/i })).toBeNull()
    // It should not have the border-destructive class
    expect(container.firstChild).not.toHaveClass('border-destructive/70')

    // Now switch to source mode and type something to make it dirty
    await user.click(screen.getByRole('button', { name: 'Source' }))
    const source = screen.getByRole('textbox', { name: /markdown source/i })

    // Type something to make it dirty
    await user.type(source, 'a')

    // Backspace to make it empty again (and thus invalid because required)
    await user.clear(source)

    // Since it has been edited, it is dirty.
    // The empty validation issue should now be visually displayed.
    await waitFor(() => {
      expect(screen.getByText('Содержание не может быть пустым.')).toBeInTheDocument()
    })
    expect(container.querySelector('.border-destructive\\/70')).not.toBeNull()
  })
})
