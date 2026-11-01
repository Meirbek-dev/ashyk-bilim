import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from '@codemirror/language'
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import { EditorState, Prec, type Extension } from '@codemirror/state'
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view'

import type { EditorPrefs } from '../../model/ide'
import { phrases } from './phrases'
import { chrome, highlight } from './theme'

/** The workspace's keys (B-COD-32); a key without a handler falls through to CodeMirror's own binding. */
export type EditorKey = 'run' | 'submit' | 'save'

/**
 * What a desktop code editor does (B-COD-33): line numbers and folds, multiple cursors (Alt+click, Ctrl/⌘+D),
 * rectangular selection, auto-closed brackets, completion (the language's, else the file's words: `loadMode`), search and
 * replace (Ctrl/⌘+F), matches of the selection, comment toggling (Ctrl/⌘+/), line moves (Alt+↑/↓).
 */
export function editing(pressed: (key: EditorKey) => boolean): Extension[] {
  return [
    lineNumbers(),
    foldGutter(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    search({ top: true }),
    EditorState.phrases.of(phrases()),
    syntaxHighlighting(highlight),
    chrome,
    // Above the default keymap: Ctrl/⌘+Enter would insert a blank line there.
    Prec.highest(
      keymap.of([
        { key: 'Mod-Enter', run: () => pressed('run') },
        { key: 'Mod-Shift-Enter', run: () => pressed('submit') },
        { key: 'Mod-s', run: () => pressed('save') },
      ]),
    ),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      indentWithTab,
    ]),
  ]
}

/** The learner's settings (B-COD-30): indent width and soft wrapping; the text size is the host's class. */
export const tuning = ({ tabSize, wrap }: Pick<EditorPrefs, 'tabSize' | 'wrap'>): Extension[] => [
  EditorState.tabSize.of(tabSize),
  indentUnit.of(' '.repeat(tabSize)),
  wrap ? EditorView.lineWrapping : [],
]
