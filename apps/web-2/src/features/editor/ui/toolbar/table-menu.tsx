import type { ChainedCommands, Editor } from '@tiptap/core'
import { Table } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { IconButton } from '#/shared/components/icon-button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '#/shared/ui/dropdown-menu'

const ACTIONS: { label: () => string; run: (chain: ChainedCommands) => ChainedCommands }[] = [
  { label: m.editor_table_row_before, run: chain => chain.addRowBefore() },
  { label: m.editor_table_row_after, run: chain => chain.addRowAfter() },
  { label: m.editor_table_column_before, run: chain => chain.addColumnBefore() },
  { label: m.editor_table_column_after, run: chain => chain.addColumnAfter() },
  { label: m.editor_table_row_delete, run: chain => chain.deleteRow() },
  { label: m.editor_table_column_delete, run: chain => chain.deleteColumn() },
  { label: m.editor_table_delete, run: chain => chain.deleteTable() },
]

/** Rows and columns of the table under the cursor (B-EDT-25): add on either side, delete, or drop the table. */
export function TableMenu({ editor }: { editor: Editor }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<IconButton label={m.editor_table()} icon={<Table aria-hidden />} />} />
      <DropdownMenuContent align="end">
        {ACTIONS.map(action => (
          <DropdownMenuItem key={action.label()} onClick={() => action.run(editor.chain().focus()).run()}>
            {action.label()}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
