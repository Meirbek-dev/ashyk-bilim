import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, HighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language'
import { Annotation, Compartment, EditorState } from '@codemirror/state'
import { drawSelection, EditorView, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { useEffect, useEffectEvent, useRef } from 'react'

import { loadMode } from './editor-modes'

// Colors are the theme's tokens (status inks hold 4.5:1 on background in every theme, DESIGN 2), as classes.
const highlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.operatorKeyword, tags.modifier], class: 'text-info font-medium' },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], class: 'text-success' },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], class: 'text-warning' },
  { tag: [tags.comment, tags.meta], class: 'text-muted-foreground italic' },
  { tag: [tags.function(tags.variableName), tags.definition(tags.variableName)], class: 'font-medium' },
  { tag: tags.invalid, class: 'text-destructive' },
])

const chrome = EditorView.theme({
  '&': { backgroundColor: 'var(--background)', color: 'var(--foreground)' },
  '&.cm-focused': { outline: '2px solid var(--ring)', outlineOffset: '2px' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.5' },
  '.cm-content': { caretColor: 'var(--foreground)' },
  '.cm-cursor': { borderLeftColor: 'var(--foreground)' },
  '.cm-gutters': { backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)', border: 'none' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'color-mix(in oklab, var(--accent) 60%, transparent)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'color-mix(in oklab, var(--ring) 30%, transparent)',
  },
  '.cm-matchingBracket': { backgroundColor: 'color-mix(in oklab, var(--ring) 25%, transparent)' },
})

/** A replacement that came in through `value` (a language switch): not an edit, so not reported back. */
const fromProps = Annotation.define<boolean>()

type CodeEditorProps = {
  value: string
  /** The server's editor language id (`monaco_language`); unknown ids edit as plain text. */
  mode: string
  /** The accessible name of the text area. */
  label: string
  onChange?: (value: string) => void
  readOnly?: boolean
}

/**
 * CodeMirror 6 (spec Q7) behind the feature's lazy boundary. The view owns the text while typing; a new `value` from
 * outside (a language switch, a reset) replaces it. Tab indents; Escape then Tab leaves the editor (CodeMirror's
 * documented focus escape).
 */
export function CodeEditor({ value, mode, label, onChange, readOnly = false }: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const language = useRef(new Compartment())
  // Read when the view is built and when it reports an edit: neither is a reason to rebuild it.
  const initialDoc = useEffectEvent(() => value)
  const changed = useEffectEvent((text: string) => onChange?.(text))

  useEffect(() => {
    const parent = host.current
    if (!parent) return undefined
    const created = new EditorView({
      parent,
      state: EditorState.create({
        doc: initialDoc(),
        extensions: [
          lineNumbers(),
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          highlightActiveLine(),
          syntaxHighlighting(highlight),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          chrome,
          language.current.of([]),
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
          EditorView.contentAttributes.of({ 'aria-label': label }),
          EditorView.updateListener.of(update => {
            const typed = update.transactions.some(transaction => !transaction.annotation(fromProps))
            if (update.docChanged && typed) changed(update.state.doc.toString())
          }),
        ],
      }),
    })
    view.current = created
    return () => created.destroy()
  }, [readOnly, label])

  useEffect(() => {
    let current = true
    void loadMode(mode).then(extension => {
      if (current) view.current?.dispatch({ effects: language.current.reconfigure(extension) })
      return extension
    })
    return () => {
      current = false
    }
  }, [mode])

  useEffect(() => {
    const editor = view.current
    if (editor && editor.state.doc.toString() !== value)
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: value },
        annotations: fromProps.of(true),
      })
  }, [value])

  return <div ref={host} className="min-h-40 overflow-hidden rounded-md border border-input text-sm" />
}
