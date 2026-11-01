import { HighlightStyle } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { tags } from '@lezer/highlight'

// Colors are the theme's tokens (status inks hold 4.5:1 on background in every theme, DESIGN 2), as classes.
export const highlight = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.operatorKeyword, tags.modifier, tags.controlKeyword, tags.self],
    class: 'text-info font-medium',
  },
  { tag: [tags.typeName, tags.className, tags.namespace], class: 'text-info' },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], class: 'text-success' },
  { tag: [tags.number, tags.bool, tags.null, tags.atom, tags.escape], class: 'text-warning' },
  { tag: [tags.comment, tags.meta], class: 'text-muted-foreground italic' },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.definition(tags.variableName)],
    class: 'font-medium',
  },
  { tag: [tags.operator, tags.punctuation], class: 'text-muted-foreground' },
  { tag: tags.invalid, class: 'text-destructive' },
])

const mix = (token: string, share: number) => `color-mix(in oklab, var(--${token}) ${share}%, transparent)`

/** The editor's chrome on the kit's tokens: gutters, selection, search panel, completion list, folds. */
export const chrome = EditorView.theme({
  '&': { backgroundColor: 'var(--background)', color: 'var(--foreground)' },
  // Inset: the editor sits in clipped frames (the workspace, a bordered desk), an outer ring would be cut off.
  '&.cm-focused': { outline: '2px solid var(--ring)', outlineOffset: '-2px' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.6' },
  '.cm-content': { caretColor: 'var(--foreground)', paddingBlock: '0.5rem' },
  '.cm-cursor, .cm-dropCursor': { borderLeft: '2px solid var(--foreground)' },
  '.cm-gutters': { backgroundColor: 'var(--background)', color: 'var(--muted-foreground)', border: 'none' },
  '.cm-lineNumbers .cm-gutterElement': { paddingInline: '0.75rem 0.25rem', minWidth: '2.5rem' },
  '.cm-activeLine': { backgroundColor: mix('accent', 50) },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--foreground)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': { backgroundColor: mix('ring', 30) },
  '.cm-selectionMatch': { backgroundColor: mix('ring', 15) },
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
    backgroundColor: mix('ring', 25),
    outline: `1px solid ${mix('ring', 60)}`,
  },
  '.cm-foldGutter .cm-gutterElement': { paddingInline: '0.25rem', cursor: 'pointer' },
  '.cm-foldPlaceholder': {
    backgroundColor: 'var(--muted)',
    color: 'var(--muted-foreground)',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    paddingInline: '0.375rem',
  },
  '.cm-searchMatch': { backgroundColor: mix('warning', 25), borderRadius: '2px' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: mix('warning', 50) },
  '.cm-panels': { backgroundColor: 'var(--muted)', color: 'var(--foreground)', fontFamily: 'var(--font-sans)' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--border)' },
  '.cm-panel.cm-search, .cm-panel.cm-gotoLine': { padding: '0.5rem 2rem 0.5rem 0.75rem', fontSize: '0.875rem' },
  '.cm-panel label': { display: 'inline-flex', alignItems: 'center', gap: '0.25rem', marginInlineEnd: '0.75rem' },
  '.cm-panel button[name=close]': { color: 'var(--muted-foreground)', fontSize: '1.25rem', insetInlineEnd: '0.5rem' },
  '.cm-textfield': {
    backgroundColor: 'var(--background)',
    color: 'var(--foreground)',
    border: '1px solid var(--input)',
    borderRadius: 'var(--radius-md)',
    padding: '0.25rem 0.5rem',
    fontSize: '0.875rem',
  },
  '.cm-button': {
    backgroundColor: 'var(--background)',
    backgroundImage: 'none',
    color: 'var(--foreground)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    padding: '0.25rem 0.625rem',
    fontSize: '0.875rem',
  },
  '.cm-button:hover': { backgroundColor: 'var(--accent)' },
  '.cm-tooltip': {
    backgroundColor: 'var(--popover)',
    color: 'var(--popover-foreground)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    boxShadow: '0 4px 12px -4px color-mix(in oklab, var(--foreground) 25%, transparent)',
    overflow: 'hidden',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul': {
    fontFamily: 'var(--font-mono)',
    maxHeight: '16rem',
    padding: '0.25rem',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li': { borderRadius: 'var(--radius-sm)', padding: '0.125rem 0.5rem' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--accent)',
    color: 'var(--accent-foreground)',
  },
  '.cm-completionMatchedText': { textDecoration: 'none', fontWeight: '600' },
  '.cm-completionDetail': { color: 'var(--muted-foreground)', fontStyle: 'normal', marginInlineStart: '0.75rem' },
})
