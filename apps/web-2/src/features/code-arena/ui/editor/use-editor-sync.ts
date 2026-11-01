import type { Compartment } from '@codemirror/state'
import { Annotation } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { useEffect, type RefObject } from 'react'

import { loadMode } from './editor-modes'

/** A replacement that came in through `value` (a language switch): not an edit, so not reported back. */
export const fromProps = Annotation.define<boolean>()

/**
 * The view follows its props without being rebuilt (that would drop history, selection and the loaded language):
 * a new mode loads its language into its compartment, a new `value` from outside (a language switch, a reset)
 * replaces the text.
 */
export function useEditorSync(
  view: RefObject<EditorView | null>,
  language: RefObject<Compartment>,
  mode: string,
  value: string,
) {
  useEffect(() => {
    let current = true
    void loadMode(mode).then(extension => {
      if (current) view.current?.dispatch({ effects: language.current.reconfigure(extension) })
      return extension
    })
    return () => {
      current = false
    }
  }, [view, language, mode])

  useEffect(() => {
    const editor = view.current
    if (editor && editor.state.doc.toString() !== value)
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: value },
        annotations: fromProps.of(true),
      })
  }, [view, value])
}
