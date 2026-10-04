import { formatForDisplay } from '@tanstack/react-hotkeys'

import { shortcuts } from '../model/shortcuts'

/** The `?` help: every row of the shortcut registry, keys shown the platform's way (Ctrl+K, ⌘ K). */
export function ShortcutHelp() {
  return (
    <ul className="flex flex-col gap-2">
      {Object.values(shortcuts).map(shortcut => (
        <li key={shortcut.hotkey} className="flex items-center justify-between gap-4 text-sm">
          <span>{shortcut.label()}</span>
          <kbd className="rounded-sm border px-1.5 py-0.5 font-mono text-xs">{formatForDisplay(shortcut.hotkey)}</kbd>
        </li>
      ))}
    </ul>
  )
}
