import { Keyboard } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { Button } from '#/shared/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '#/shared/ui/dialog'

import { BLOCK_ITEMS, MARK_ITEMS } from './toolbar/format-items'
import { printedKeys } from '#/shared/lib/key-label'

/** Tiptap's own keys and ours, in the order a writer meets them. */
const KEYS: readonly { label: () => string; keys: string }[] = [
  ...MARK_ITEMS,
  { label: m.editor_link, keys: 'Mod-k' },
  { label: m.editor_paragraph, keys: 'Mod-Alt-0' },
  { label: () => m.editor_heading({ level: 2 }), keys: 'Mod-Alt-2' },
  { label: () => m.editor_heading({ level: 3 }), keys: 'Mod-Alt-3' },
  ...BLOCK_ITEMS,
  { label: m.editor_insert, keys: '/' },
  { label: m.editor_block_move_up, keys: 'Mod-Shift-ArrowUp' },
  { label: m.editor_block_move_down, keys: 'Mod-Shift-ArrowDown' },
  { label: m.editor_undo, keys: 'Mod-z' },
  { label: m.editor_redo, keys: 'Mod-Shift-z' },
]

/** Markdown typed at the start of a line becomes the block (StarterKit's input rules). */
const MARKDOWN: readonly { label: () => string; typed: string }[] = [
  { label: () => m.editor_heading({ level: 2 }), typed: '## ' },
  { label: m.editor_bullet_list, typed: '- ' },
  { label: m.editor_ordered_list, typed: '1. ' },
  { label: m.editor_quote, typed: '> ' },
  { label: m.editor_code_block, typed: '``` ' },
  { label: m.editor_block_divider, typed: '---' },
]

const row = (label: string, keys: string) => (
  <div key={label} className="flex items-center justify-between gap-4 py-1.5">
    <dt>{label}</dt>
    <dd>
      <kbd className="rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">{keys}</kbd>
    </dd>
  </div>
)

/** Every shortcut of the editor in one place, from the status bar. */
export function ShortcutsDialog() {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="ghost" size="sm">
            <Keyboard aria-hidden data-icon="inline-start" />
            {m.editor_shortcuts()}
          </Button>
        }
      />
      <DialogContent className="max-h-svh overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{m.editor_shortcuts()}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-x-8 text-sm sm:grid-cols-2">
          <dl className="divide-y divide-border">{KEYS.map(item => row(item.label(), printedKeys(item.keys)))}</dl>
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-muted-foreground">{m.editor_shortcuts_markdown()}</h3>
            <dl className="divide-y divide-border">{MARKDOWN.map(item => row(item.label(), item.typed))}</dl>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
