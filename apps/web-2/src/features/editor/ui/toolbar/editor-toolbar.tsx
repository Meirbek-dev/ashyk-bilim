import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { Link2, Plus, Redo2, Undo2 } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { Button } from '#/shared/ui/button'
import { Separator } from '#/shared/ui/separator'

import { CodeLanguageMenu } from './code-language-menu'
import { BLOCK_ITEMS, MARK_ITEMS, type FormatItem } from './format-items'
import { TableMenu } from './table-menu'
import { TextStyleMenu } from './text-style-menu'
import { ToolButton } from './tool-button'

type EditorToolbarProps = {
  editor: Editor
  /** Opens the link dialog (the toolbar's button; Ctrl/⌘+K and the link bubble open the same one). */
  onLink: () => void
  /** Opens the insert menu under the button (the "/" menu); absent = no blocks (discussions). */
  onInsert?: ((anchor: Element) => void) | undefined
}

const gap = <Separator orientation="vertical" className="mx-1 h-5 self-center" />

/**
 * The editor's toolbar in one row (scrolls sideways on a phone rather than wrapping) in groups: history, text style (in words), inline formats and link, block formats, then the
 * code block's language or the table's rows and columns while the cursor is in one, and Insert block at the end.
 * Pressed = applied under the cursor; every tooltip names the action and prints its shortcut.
 */
export function EditorToolbar({ editor, onLink, onInsert }: EditorToolbarProps) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      marks: MARK_ITEMS.map(item => current.isActive(item.name)),
      blocks: BLOCK_ITEMS.map(item => current.isActive(item.name)),
      link: current.isActive('link'),
      level: Number(current.getAttributes('heading')['level'] ?? 0),
      code: current.isActive('codeBlock'),
      language: String(current.getAttributes('codeBlock')['language'] ?? '') || null,
      table: current.isActive('table'),
      undo: current.can().undo(),
      redo: current.can().redo(),
    }),
  })
  const toggles = (items: readonly FormatItem[], active: boolean[]) =>
    items.map((item, index) => (
      <ToolButton
        key={item.name}
        label={item.label()}
        icon={<item.Icon aria-hidden />}
        keys={item.keys}
        aria-pressed={active[index] === true}
        onClick={() => item.run(editor)}
      />
    ))
  return (
    <div
      role="toolbar"
      aria-label={m.editor_toolbar()}
      className="sticky top-14 z-20 flex items-center gap-0.5 overflow-x-auto overscroll-x-contain border-b border-border bg-background py-1 *:shrink-0 *:aria-pressed:bg-accent *:aria-pressed:text-accent-foreground"
    >
      <ToolButton
        label={m.editor_undo()}
        icon={<Undo2 aria-hidden />}
        keys="Mod-z"
        disabled={!state.undo}
        onClick={() => editor.chain().focus().undo().run()}
      />
      <ToolButton
        label={m.editor_redo()}
        icon={<Redo2 aria-hidden />}
        keys="Mod-Shift-z"
        disabled={!state.redo}
        onClick={() => editor.chain().focus().redo().run()}
      />
      {gap}
      <TextStyleMenu editor={editor} level={state.level} />
      {gap}
      {toggles(MARK_ITEMS, state.marks)}
      <ToolButton
        label={m.editor_link()}
        icon={<Link2 aria-hidden />}
        keys="Mod-k"
        aria-pressed={state.link}
        onClick={onLink}
      />
      {gap}
      {toggles(BLOCK_ITEMS, state.blocks)}
      {state.code || state.table ? gap : null}
      {state.code ? <CodeLanguageMenu editor={editor} language={state.language} /> : null}
      {state.table ? <TableMenu editor={editor} /> : null}
      {onInsert ? (
        <Button
          variant="outline"
          aria-label={m.editor_insert()}
          className="ml-auto max-sm:w-8 max-sm:px-0"
          onClick={event => onInsert(event.currentTarget)}
        >
          <Plus aria-hidden />
          <span className="max-sm:hidden">{m.editor_insert()}</span>
        </Button>
      ) : null}
    </div>
  )
}
