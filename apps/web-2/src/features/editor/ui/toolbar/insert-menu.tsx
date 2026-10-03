import type { Editor } from '@tiptap/core'

import { m } from '#/paraglide/messages'
import { AnchoredListbox } from '#/shared/components/anchored-listbox'

import { INSERT_ITEMS, type MenuAnchor } from './insert-items'

type InsertMenuProps = { editor: Editor; anchor: MenuAnchor | null; onClose: () => void }

/** The one block menu: opened by "/" at the caret or by the toolbar button; search, arrows, Enter inserts. */
export function InsertMenu({ editor, anchor, onClose }: InsertMenuProps) {
  return (
    <AnchoredListbox
      label={m.editor_insert()}
      options={INSERT_ITEMS.map(item => ({ value: item.value, label: item.label(), icon: <item.Icon aria-hidden /> }))}
      anchor={anchor}
      open={anchor !== null}
      onOpenChange={open => {
        if (open) return
        onClose()
        editor.commands.focus()
      }}
      onSelect={option => INSERT_ITEMS.find(item => item.value === option.value)?.insert(editor)}
    />
  )
}
