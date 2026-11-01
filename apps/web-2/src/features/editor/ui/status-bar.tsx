import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'

import { m } from '#/paraglide/messages'

import { readingMinutes, wordCount } from '../model/word-count'
import { ShortcutsDialog } from './shortcuts-dialog'

/** The sheet's bottom edge: how long the page is (words, minutes to read) and the shortcuts list. */
export function StatusBar({ editor }: { editor: Editor }) {
  const words = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const { doc } = current.state
      return wordCount(doc.textBetween(0, doc.content.size, ' ', ' '))
    },
  })
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-1 text-xs text-muted-foreground">
      <p aria-live="polite" className="tabular-nums">
        {m.editor_words({ count: words })}
        {words > 0 ? ` · ${m.editor_reading_time({ minutes: readingMinutes(words) })}` : ''}
      </p>
      <ShortcutsDialog />
    </div>
  )
}
