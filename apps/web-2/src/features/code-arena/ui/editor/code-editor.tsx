import { Compartment, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { useEffect, useEffectEvent, useRef, useState } from 'react'

import { DEFAULT_PREFS, type EditorPrefs, type FontSize } from '../../model/ide'
import { CursorStatus, type Cursor } from './cursor-status'
import { editing, tuning, type EditorKey } from './extensions'
import { fromProps, useEditorSync } from './use-editor-sync'

// The type scale's sizes (DESIGN 4); CodeMirror inherits the host's.
const FONT: Record<FontSize, string> = { sm: 'text-xs', md: 'text-sm', lg: 'text-base' }
// A desk tall enough for a short program without scrolling (the studio, a past attempt).
const DESK = 'min-h-64 overflow-hidden rounded-md border border-input [&_.cm-editor]:min-h-64'
// The workspace: the editor takes the height its pane gives it and scrolls inside.
const FILL = 'relative min-h-0 flex-1 [&_.cm-editor]:absolute [&_.cm-editor]:inset-0'

type CodeEditorProps = {
  value: string
  /** The server's editor language id (`monaco_language`); unknown ids edit as plain text. */
  mode: string
  /** The accessible name of the text area. */
  label: string
  onChange?: (value: string) => void
  readOnly?: boolean
  /** Text size, indent and wrapping (B-COD-30); the studio and past attempts use the defaults. */
  prefs?: Pick<EditorPrefs, 'fontSize' | 'tabSize' | 'wrap'>
  /** The workspace's keys (B-COD-32): Ctrl/⌘+Enter runs, Ctrl/⌘+Shift+Enter submits, Ctrl/⌘+S saves now. */
  keys?: Partial<Record<EditorKey, () => void>>
  /** Fill the parent's height and show the cursor line (the workspace) instead of a fixed desk. */
  fill?: boolean
}

/**
 * CodeMirror 6 (spec Q7) behind the feature's lazy boundary. The view owns the text while typing; a new `value` from
 * outside (a language switch, a reset) replaces it (`useEditorSync`). Tab indents; Escape then Tab leaves the editor
 * (CodeMirror's documented focus escape).
 */
export function CodeEditor(props: CodeEditorProps) {
  const { value, mode, label, onChange, readOnly = false, prefs = DEFAULT_PREFS, keys, fill = false } = props
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const language = useRef(new Compartment())
  const configuration = useRef(new Compartment())
  const tuned = useRef(new Compartment())
  const [cursor, setCursor] = useState<Cursor>({ line: 1, column: 1, selected: 0 })
  // Read when the view is built and when it reports an edit or a key: neither is a reason to rebuild it.
  const initialDoc = useEffectEvent(() => value)
  const changed = useEffectEvent((text: string) => onChange?.(text))
  const pressed = useEffectEvent((key: EditorKey) => {
    const handler = keys?.[key]
    handler?.()
    return handler !== undefined
  })

  useEffect(() => {
    const parent = host.current
    if (!parent) return undefined
    const created = new EditorView({
      parent,
      state: EditorState.create({
        doc: initialDoc(),
        extensions: [
          editing(key => pressed(key)),
          language.current.of([]),
          configuration.current.of([]),
          tuned.current.of([]),
          EditorView.updateListener.of(update => {
            const typed = update.transactions.some(transaction => !transaction.annotation(fromProps))
            if (update.docChanged && typed) changed(update.state.doc.toString())
            if (update.docChanged || update.selectionSet) setCursor(cursorOf(update.state))
          }),
        ],
      }),
    })
    view.current = created
    return () => {
      view.current = null
      created.destroy()
    }
  }, [])

  // Reconfigure the existing view: rebuilding it drops history, selection and the loaded language.
  useEffect(() => {
    view.current?.dispatch({
      effects: configuration.current.reconfigure([
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
        EditorView.contentAttributes.of({ 'aria-label': label }),
      ]),
    })
  }, [readOnly, label])

  const { tabSize, wrap, fontSize } = prefs
  useEffect(() => {
    view.current?.dispatch({ effects: tuned.current.reconfigure(tuning({ tabSize, wrap })) })
  }, [tabSize, wrap])

  useEditorSync(view, language, mode, value)

  if (!fill) return <div ref={host} className={`${DESK} ${FONT[fontSize]}`} />
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={host} className={`${FILL} ${FONT[fontSize]}`} />
      <CursorStatus cursor={cursor} tabSize={tabSize} />
    </div>
  )
}

/** The main cursor's line and column (1-based) and the characters selected across all ranges. */
function cursorOf(state: EditorState): Cursor {
  const head = state.selection.main.head
  const line = state.doc.lineAt(head)
  const selected = state.selection.ranges.reduce((sum, range) => sum + range.to - range.from, 0)
  return { line: line.number, column: head - line.from + 1, selected }
}
