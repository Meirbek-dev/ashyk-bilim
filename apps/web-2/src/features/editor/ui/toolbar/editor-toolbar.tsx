import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { Plus, Redo2, Undo2 } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { ActionMenu } from '#/shared/ui/action-menu'
import { IconButton } from '#/shared/ui/icon-button'

import { FORMAT_ITEMS } from './format-items'
import { INSERT_ITEMS } from './insert-items'
import { LinkButton } from './link-button'
import { TextStyleMenu } from './text-style-menu'

/** The editor's toolbar: text style, formatting toggles (pressed = applied), link, Insert block, undo/redo. */
export function EditorToolbar({ editor, blocks }: { editor: Editor; blocks: boolean }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      active: FORMAT_ITEMS.map(item => current.isActive(item.name)),
      link: current.isActive('link'),
      level: Number(current.getAttributes('heading')['level'] ?? 0),
      undo: current.can().undo(),
      redo: current.can().redo(),
    }),
  })
  return (
    <div
      role="toolbar"
      aria-label={m.editor_toolbar()}
      className="sticky top-0 z-10 flex flex-wrap gap-1 border-b border-border bg-background py-1 *:aria-pressed:bg-accent *:aria-pressed:text-accent-foreground"
    >
      <TextStyleMenu editor={editor} level={state.level} />
      {FORMAT_ITEMS.map((item, index) => (
        <IconButton
          key={item.name}
          label={item.label()}
          icon={<item.Icon aria-hidden />}
          aria-pressed={state.active[index] === true}
          onClick={() => item.run(editor)}
        />
      ))}
      <LinkButton editor={editor} active={state.link} />
      {blocks ? (
        <ActionMenu
          trigger={<IconButton label={m.editor_insert()} icon={<Plus aria-hidden />} />}
          actions={INSERT_ITEMS.map(item => ({ label: item.label(), onSelect: () => void item.insert(editor) }))}
        />
      ) : null}
      <IconButton
        label={m.editor_undo()}
        icon={<Undo2 aria-hidden />}
        disabled={!state.undo}
        onClick={() => editor.chain().focus().undo().run()}
      />
      <IconButton
        label={m.editor_redo()}
        icon={<Redo2 aria-hidden />}
        disabled={!state.redo}
        onClick={() => editor.chain().focus().redo().run()}
      />
    </div>
  )
}
