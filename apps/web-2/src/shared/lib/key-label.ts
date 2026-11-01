const APPLE: Record<string, string> = { Mod: '⌘', Alt: '⌥', Shift: '⇧', Ctrl: '⌃' }
const OTHERS: Record<string, string> = { Mod: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Ctrl: 'Ctrl' }
const KEYS: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Enter: '↵' }

/**
 * A key combo in Tiptap / CodeMirror notation (`Mod-Shift-8`) as printed on this platform: «Ctrl+Shift+8», or «⌘⇧8» on
 * a Mac, iPhone or iPad. A lone `-` is the minus key.
 */
export function keyLabel(combo: string, apple: boolean): string {
  const parts = combo === '-' ? ['-'] : combo.split(/-(?!$)/)
  const names = parts.map(part => (apple ? APPLE : OTHERS)[part] ?? KEYS[part] ?? part.toUpperCase())
  return names.join(apple ? '' : '+')
}

/** Apple keyboards print ⌘ and ⌥ where others print Ctrl and Alt (editors render in the browser only). */
const apple = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)

/** A combo as this platform prints it. */
export const printedKeys = (combo: string) => keyLabel(combo, apple())
