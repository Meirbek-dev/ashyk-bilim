import type { ViolationEvent } from '#/shared/api/gen/types.gen'

/** What the attempt guards report (`kind` is client text: web-2 and the old web spell some differently). */
export type ViolationKind =
  | 'tab_switch'
  | 'copy_paste'
  | 'fullscreen_exit'
  | 'devtools'
  | 'resize'
  | 'context_menu'
  | 'keys'

const KINDS: Record<string, ViolationKind> = {
  tab_switch: 'tab_switch',
  blur: 'tab_switch',
  copy_paste: 'copy_paste',
  copy: 'copy_paste',
  fullscreen_exit: 'fullscreen_exit',
  devtools: 'devtools',
  resize: 'resize',
  contextmenu: 'context_menu',
  right_click: 'context_menu',
  keydown: 'keys',
}

/** A reported kind in either spelling and case; null for one this web has no name for (shown as sent). */
export const violationKind = (kind: string): ViolationKind | null => KINDS[kind.trim().toLowerCase()] ?? null

/** The events in the order they happened (the server appends, but a replayed queue may not). */
export const orderedViolations = (events: readonly ViolationEvent[]): ViolationEvent[] =>
  events.toSorted((a, b) => a.at - b.at)
