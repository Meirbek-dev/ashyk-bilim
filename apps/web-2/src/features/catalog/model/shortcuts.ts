import type { Hotkey } from '@tanstack/react-hotkeys'

import { m } from '#/paraglide/messages'

/**
 * The one shortcut registry (spec 7.3): every `useHotkey` reads its keys here, and the `?` help lists this table.
 * It lives in `catalog` because the shell slot imports the palette from here: a registry in `platform` would make
 * `platform -> catalog -> platform` an import cycle. The player's rows act only inside `/learn/...`.
 */
export const shortcuts = {
  palette: { hotkey: 'Mod+K', label: m.catalog_shortcut_palette },
  help: { hotkey: '?', label: m.catalog_shortcut_help },
  close: { hotkey: 'Escape', label: m.catalog_shortcut_close },
  prev: { hotkey: 'ArrowLeft', label: m.player_shortcut_prev },
  next: { hotkey: 'ArrowRight', label: m.player_shortcut_next },
  contents: { hotkey: 'O', label: m.player_shortcut_contents },
  mark: { hotkey: 'M', label: m.player_shortcut_mark },
} satisfies Record<string, { hotkey: Hotkey; label: () => string }>
