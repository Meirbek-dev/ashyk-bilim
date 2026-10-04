import type { AnyExtension } from '@tiptap/core'
import { Image } from '@tiptap/extension-image'
import { Mathematics } from '@tiptap/extension-mathematics'
import { TableKit } from '@tiptap/extension-table'
import { StarterKit } from '@tiptap/starter-kit'

import { safeUrl } from './sanitize'

/**
 * The markdown editor's document: the editor feature's text core (StarterKit with the same link rules, tables,
 * images) plus `$inline$` / `$$block$$` math, each with a markdown parser and serializer (@tiptap/markdown).
 * Code blocks keep their fence language; raw HTML is not part of the document.
 */
export const markdownSchema = (): AnyExtension[] => [
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
  Mathematics,
]
