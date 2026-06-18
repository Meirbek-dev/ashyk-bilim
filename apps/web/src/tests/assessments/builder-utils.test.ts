import { describe, expect, it } from 'vite-plus/test'

import {
  getIssueFocusTargetId,
  getOutlineWindow,
  moveUuidInOrder,
  splitMetadataList,
} from '@/features/assessments/studio/tabs/builderUtils'

describe('assessment builder helpers', () => {
  it('moves item UUIDs one step with boundary protection', () => {
    expect(moveUuidInOrder(['a', 'b', 'c'], 'b', 'up')).toEqual(['b', 'a', 'c'])
    expect(moveUuidInOrder(['a', 'b', 'c'], 'b', 'down')).toEqual(['a', 'c', 'b'])
    expect(moveUuidInOrder(['a', 'b', 'c'], 'a', 'up')).toEqual(['a', 'b', 'c'])
    expect(moveUuidInOrder(['a', 'b', 'c'], 'missing', 'down')).toEqual(['a', 'b', 'c'])
  })

  it('windows large outlines around the selected question', () => {
    const items = Array.from({ length: 120 }, (_, index) => ({ item_uuid: `item_${index}` }))
    const window = getOutlineWindow(items, 'item_60', 80)

    expect(window.isWindowed).toBe(true)
    expect(window.startIndex).toBeGreaterThan(0)
    expect(window.endIndex).toBeLessThan(items.length)
    expect(window.visibleItems.some(item => item.item_uuid === 'item_60')).toBe(true)
    expect(window.beforeCount + window.visibleItems.length + window.afterCount).toBe(items.length)
  })

  it('keeps small outlines unwindowed', () => {
    const items = Array.from({ length: 10 }, (_, index) => ({ item_uuid: `item_${index}` }))

    expect(getOutlineWindow(items, 'item_5', 80)).toEqual({
      visibleItems: items,
      startIndex: 0,
      endIndex: 10,
      beforeCount: 0,
      afterCount: 0,
      isWindowed: false,
    })
  })

  it('maps readiness issues to concrete builder focus targets', () => {
    expect(getIssueFocusTargetId({ code: 'item.title_missing' })).toBe('canvas-item-title')
    expect(getIssueFocusTargetId({ code: 'item.max_score_invalid' })).toBe('canvas-item-points')
    expect(getIssueFocusTargetId({ code: 'choice.prompt_missing' })).toBe('canvas-item-content')
    expect(getIssueFocusTargetId(null)).toBe('canvas-item-content')
  })

  it('normalizes comma-separated metadata values', () => {
    expect(splitMetadataList(' algebra, midterm, algebra ,, LO-1 ')).toEqual(['algebra', 'midterm', 'LO-1'])
  })
})
