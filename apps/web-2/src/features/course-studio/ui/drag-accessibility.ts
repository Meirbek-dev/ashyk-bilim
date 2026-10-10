import { Accessibility } from '@dnd-kit/dom'
import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/react'

import { m } from '#/paraglide/messages'
import type { Curriculum } from '#/shared/api/gen/types.gen'

/**
 * What a screen reader hears while a chapter or an activity is dragged: names and the interface language, not
 * dnd-kit's English defaults with raw ids. Replaces the default Accessibility plugin of the DragDropProvider.
 */
export function dragAccessibility(curriculum: Curriculum) {
  const names = new Map(
    curriculum.chapters.flatMap(chapter => [
      [chapter.id, chapter.name] as const,
      ...chapter.activities.map(activity => [activity.id, activity.name] as const),
    ]),
  )
  const name = (entity: { id: string | number } | null | undefined) =>
    entity ? (names.get(String(entity.id)) ?? '') : ''
  return Accessibility.configure({
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
}
