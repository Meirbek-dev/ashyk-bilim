import { m } from '#/paraglide/messages'
import { formatNumber } from '#/shared/i18n/format'

export type Cursor = { line: number; column: number; selected: number }

/** Under the editor, as in a desktop editor: where the cursor is, how much is selected, the indent (B-COD-33). */
export function CursorStatus({ cursor, tabSize }: { cursor: Cursor; tabSize: number }) {
  return (
    <p className="flex shrink-0 items-center justify-end gap-4 border-t px-3 py-1 text-xs text-muted-foreground tabular-nums">
      <span>
        {m.code_cursor({ line: formatNumber(cursor.line), column: formatNumber(cursor.column) })}
        {cursor.selected > 0 ? ` (${m.code_cursor_selected({ count: cursor.selected })})` : null}
      </span>
      <span>{m.code_indent_spaces({ size: formatNumber(tabSize) })}</span>
    </p>
  )
}
