import type { AnyExtension } from '@tiptap/core'
import { Image } from '@tiptap/extension-image'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { TableKit } from '@tiptap/extension-table'
import { StarterKit } from '@tiptap/starter-kit'

import { safeUrl } from './sanitize'

/**
 * The markdown document of the editor and of the renderer: the editor feature's text core (StarterKit with the same
 * link rules, tables, images), GFM task lists, plus `math` (`$inline$` / `$$block$$`: `Mathematics`, which carries
 * KaTeX, so a view without `$` in its text parses without it). Every extension brings its markdown parser and
 * serializer (@tiptap/markdown). Code blocks keep their fence language; raw HTML is not part of the document.
 */
export const markdownSchema = (math: AnyExtension[] = []): AnyExtension[] => [
  StarterKit.configure({
    link: {
      openOnClick: false,
      autolink: true,
      defaultProtocol: 'https',
      isAllowedUri: url => safeUrl(url) !== undefined,
      HTMLAttributes: { rel: 'noopener noreferrer', target: null },
    },
  }),
  TableKit.configure({ table: { resizable: false } }),
  Image,
  TaskList,
  TaskItem.configure({ nested: true }),
  ...math,
]
