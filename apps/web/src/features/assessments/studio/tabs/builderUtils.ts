import type { ValidationIssue } from '@/features/assessments/domain/view-models'

export type ReorderDirection = 'up' | 'down'

export interface OutlineWindow<T> {
  visibleItems: T[]
  startIndex: number
  endIndex: number
  beforeCount: number
  afterCount: number
  isWindowed: boolean
}

export const OUTLINE_WINDOW_THRESHOLD = 80
const OUTLINE_WINDOW_RADIUS = 24

export function moveUuidInOrder(orderedUuids: string[], itemUuid: string, direction: ReorderDirection): string[] {
  const currentIndex = orderedUuids.indexOf(itemUuid)
  if (currentIndex === -1) return orderedUuids
  const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
  if (nextIndex < 0 || nextIndex >= orderedUuids.length) return orderedUuids

  const next = [...orderedUuids]
  const [moved] = next.splice(currentIndex, 1)
  if (!moved) return orderedUuids
  next.splice(nextIndex, 0, moved)
  return next
}

export function getOutlineWindow<T extends { item_uuid: string }>(
  items: T[],
  selectedItemUuid: string | null,
  threshold = OUTLINE_WINDOW_THRESHOLD,
): OutlineWindow<T> {
  if (items.length <= threshold) {
    return {
      visibleItems: items,
      startIndex: 0,
      endIndex: items.length,
      beforeCount: 0,
      afterCount: 0,
      isWindowed: false,
    }
  }

  const selectedIndex = selectedItemUuid ? items.findIndex(item => item.item_uuid === selectedItemUuid) : 0
  const centerIndex = selectedIndex >= 0 ? selectedIndex : 0
  const startIndex = Math.max(0, centerIndex - OUTLINE_WINDOW_RADIUS)
  const endIndex = Math.min(items.length, centerIndex + OUTLINE_WINDOW_RADIUS + 1)

  return {
    visibleItems: items.slice(startIndex, endIndex),
    startIndex,
    endIndex,
    beforeCount: startIndex,
    afterCount: items.length - endIndex,
    isWindowed: true,
  }
}

export function getIssueFocusTargetId(issue: Pick<ValidationIssue, 'code' | 'field'> | null | undefined): string {
  if (!issue) return 'canvas-item-content'
  if (issue.field === 'title' || issue.code === 'item.title_missing') return 'canvas-item-title'
  if (issue.field === 'max_score' || issue.code === 'item.max_score_invalid') return 'canvas-item-points'
  if (issue.field === 'prompt') return 'choice-prompt-field'
  if (issue.field === 'options' || issue.field === 'correct_options') return 'choice-options-field'
  if (issue.field === 'pairs') return 'choice-options-field'
  return 'canvas-item-content'
}

export function splitMetadataList(value: string): string[] {
  return [
    ...new Set(
      value
        .split(',')
        .map(part => part.trim())
        .filter(Boolean),
    ),
  ]
}
