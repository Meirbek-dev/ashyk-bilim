import { Accessibility } from '@dnd-kit/dom'
import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/react'

import { m } from '#/paraglide/messages'

/**
 * What a screen reader hears while a sortable thing (a chapter, an activity, a test question) is dragged: its name
 * and the interface language, not dnd-kit's English defaults with raw ids. Pass the result as the DragDropProvider's
 * `plugins`: it replaces the default Accessibility plugin and keeps the others.
 */
export function accessibleDrag(nameOf: (id: string) => string | undefined) {
  const name = (entity: { id: string | number } | null | undefined) => (entity ? (nameOf(String(entity.id)) ?? '') : '')
  const accessibility = Accessibility.configure({
    screenReaderInstructions: { draggable: m.studio_drag_instructions() },
    announcements: {
      dragstart: ({ operation }: DragStartEvent) => m.studio_drag_picked({ name: name(operation.source) }),
      dragover: ({ operation: { source, target } }: DragOverEvent) =>
        target && target.id !== source?.id
          ? m.studio_drag_over({ name: name(source), target: name(target) })
          : undefined,
      dragend: ({ operation, canceled }: DragEndEvent) =>
        (canceled ? m.studio_drag_canceled : m.studio_drag_dropped)({ name: name(operation.source) }),
    },
  })
  return <Plugin>(defaults: Plugin[]) => defaults.map(plugin => (plugin === Accessibility ? accessibility : plugin))
}
