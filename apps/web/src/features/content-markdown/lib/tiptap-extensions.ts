import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import { Table } from '@tiptap/extension-table';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableRow } from '@tiptap/extension-table-row';
import { Markdown } from 'tiptap-markdown';
import type { Extension, Node, Mark } from '@tiptap/core';

import type { MarkdownPresetConfig } from '../presets/presets';

export type EditorExtensionItem = Extension | Node | Mark;

interface BuildOptions {
  config: MarkdownPresetConfig;
  placeholder?: string;
  autoFocus?: boolean;
}

/**
 * Builds the Tiptap extension array for a given preset configuration.
 * Only registers extensions for features enabled by the preset,
 * keeping bundle impact proportional to actual usage.
 */
export function buildEditorExtensions({ config, placeholder }: BuildOptions): EditorExtensionItem[] {
  const extensions: EditorExtensionItem[] = [
    StarterKit.configure({
      codeBlock: false, // We use our own code block or disable it
      heading: {
        levels: [1, 2, 3, 4, 5, 6],
      },
      strike: {}, // Always available — strikethrough is a basic formatting action
      blockquote: {}, // Always available
      code: {}, // Inline code — always available
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
        target: null, // We set this per-link in the renderer
      },
    }),
    Markdown.configure({
      html: false,
      tightLists: true,
      transformPastedText: true,
    }),
  ];

  if (config.allowTable) {
    extensions.push(
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    );
  }

  // TaskList support: lazy-loaded to avoid pulling the extension for presets that don't need it
  if (config.allowTaskList) {
    // Dynamic requires to avoid bundling for all presets
    // These are already in @tiptap/starter-kit dependencies so no new installs needed
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { TaskList } = require('@tiptap/extension-task-list');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { TaskItem } = require('@tiptap/extension-task-item');
      extensions.push(
        TaskList,
        TaskItem.configure({ nested: true }),
      );
    } catch {
      // TaskList extensions not available — skip
    }
  }

  return extensions;
}
