import StarterKit from '@tiptap/starter-kit'
import { Placeholder } from '@tiptap/extensions'
import Link from '@tiptap/extension-link'
import { TableKit } from '@tiptap/extension-table'
import { Markdown } from 'tiptap-markdown'
import type { Extension, Mark, Node } from '@tiptap/core'

import type { MarkdownPresetConfig } from '../presets/presets'

export type EditorExtensionItem = Extension | Node | Mark

interface BuildOptions {
  config: MarkdownPresetConfig
  placeholder?: string
}

/**
 * Builds the TipTap extension array for a preset. Extension registration must
 * match toolbar capabilities so the editor never advertises unavailable actions.
 */
export function buildEditorExtensions({ config, placeholder }: BuildOptions): EditorExtensionItem[] {
  const extensions: EditorExtensionItem[] = [
    StarterKit.configure({
      codeBlock: config.allowCodeBlock ? {} : false,
      link: false,
      heading: {
        levels: [1, 2, 3, 4, 5, 6],
      },
      strike: {},
      blockquote: {},
      code: {},
    }),
    Placeholder.configure({
      placeholder: placeholder ?? config.placeholder,
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      HTMLAttributes: {
        rel: 'noopener noreferrer',
        target: null,
      },
    }),
    Markdown.configure({
      html: false,
      tightLists: true,
      transformPastedText: true,
    }),
  ]

  if (config.allowTable) {
    extensions.push(TableKit.configure({ table: { resizable: false } }))
  }

  // Task lists render through remark-gfm and snippets insert portable Markdown.
  // Avoid runtime require() in client bundles until the TipTap task extensions
  // are explicit dependencies.
  return extensions
}
