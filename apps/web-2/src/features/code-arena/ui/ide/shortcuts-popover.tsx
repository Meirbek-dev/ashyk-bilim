import { Keyboard } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { IconButton } from '#/shared/components/icon-button'
import { printedKeys } from '#/shared/lib/key-label'
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from '#/shared/ui/popover'

/** The workspace's and CodeMirror's keys (B-COD-32, B-COD-33), as this platform prints them. */
const KEYS = [
  { label: m.code_run, keys: 'Mod-Enter' },
  { label: m.code_submit, keys: 'Mod-Shift-Enter' },
  { label: m.code_key_save, keys: 'Mod-s' },
  { label: m.code_key_find, keys: 'Mod-f' },
  { label: m.code_key_go_to_line, keys: 'Mod-Alt-g' },
  { label: m.code_key_comment, keys: 'Mod-/' },
  { label: m.code_key_next_match, keys: 'Mod-d' },
  { label: m.code_key_move_line, keys: 'Alt-ArrowUp' },
  { label: m.code_key_copy_line, keys: 'Shift-Alt-ArrowDown' },
  { label: m.code_key_indent, keys: 'Mod-]' },
  { label: m.code_key_fold, keys: 'Mod-Shift-[' },
  { label: m.code_key_complete, keys: 'Ctrl-Space' },
  { label: m.code_key_undo, keys: 'Mod-z' },
] as const

/** A list to look up, not a dialog: it opens beside the editor and closes on Escape or a click away. */
export function ShortcutsPopover() {
  return (
    <Popover>
      <PopoverTrigger render={<IconButton label={m.code_shortcuts()} icon={<Keyboard aria-hidden />} />} />
      <PopoverContent align="end" className="w-80">
        <PopoverHeader>
          <PopoverTitle>{m.code_shortcuts()}</PopoverTitle>
        </PopoverHeader>
        <dl className="flex flex-col divide-y text-sm">
          {KEYS.map(item => (
            <div key={item.keys} className="flex items-center justify-between gap-4 py-1.5">
              <dt>{item.label()}</dt>
              <dd>
                <kbd className="rounded-sm bg-muted px-1.5 py-0.5 font-sans text-xs tabular-nums">
                  {printedKeys(item.keys)}
                </kbd>
              </dd>
            </div>
          ))}
          <div className="flex items-center justify-between gap-4 py-1.5">
            <dt>{m.code_key_cursors()}</dt>
            <dd>
              <kbd className="rounded-sm bg-muted px-1.5 py-0.5 font-sans text-xs">
                {m.code_key_alt_click({ alt: printedKeys('Alt') })}
              </kbd>
            </dd>
          </div>
        </dl>
      </PopoverContent>
    </Popover>
  )
}
