import type { Editor } from '@tiptap/core'
import { useRef } from 'react'

import { m } from '#/paraglide/messages'
import { AnchoredListbox } from '#/shared/components/anchored-listbox'

import { INSERT_ITEMS, type MenuAnchor } from './insert-items'

type InsertMenuProps = { editor: Editor; anchor: MenuAnchor | null; onClose: () => void }

const forms = (editor: Editor) => [...editor.view.dom.querySelectorAll('form')]

/** The one block menu: opened by "/" at the caret or by the toolbar button; search, arrows, Enter inserts. */
export function InsertMenu({ editor, anchor, onClose }: InsertMenuProps) {
  // The block forms before an insert (null: closed without one): a form that is new afterwards is the inserted block's.
  const before = useRef<HTMLFormElement[] | null>(null)
  return (
    <AnchoredListbox
      label={m.editor_insert()}
      options={INSERT_ITEMS.map(item => ({ value: item.value, label: item.label(), icon: <item.Icon aria-hidden /> }))}
      anchor={anchor}
      open={anchor !== null}
      onOpenChange={open => {
        if (!open) onClose()
      }}
      // A block with its own form (embed URL, formula, button) takes the focus in its first field; else the text.
      onClosed={() => {
        const known = before.current
        before.current = null
        const field = known
          ? forms(editor)
              .find(form => !known.includes(form))
              ?.querySelector<HTMLElement>('input, textarea')
          : null
        if (field) field.focus()
        else editor.commands.focus()
      }}
      onSelect={option => {
        before.current = forms(editor)
        INSERT_ITEMS.find(item => item.value === option.value)?.insert(editor)
      }}
    />
  )
}
