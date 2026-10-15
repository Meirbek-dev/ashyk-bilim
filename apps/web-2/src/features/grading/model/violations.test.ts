import { describe, expect, test } from 'vite-plus/test'

import { orderedViolations, violationKind } from './violations'

describe('violations', () => {
  test("B-GRD-29 both webs' spellings of a guard event read as one kind; an unknown one stays unnamed", () => {
    expect(violationKind('tab_switch')).toBe('tab_switch')
    expect(violationKind('BLUR')).toBe('tab_switch')
    expect(violationKind('copy')).toBe('copy_paste')
    expect(violationKind('FULLSCREEN_EXIT')).toBe('fullscreen_exit')
    expect(violationKind('contextmenu')).toBe('context_menu')
    expect(violationKind('something_new')).toBeNull()
    expect(
      orderedViolations([
        { at: 2, kind: 'b', detail: null },
        { at: 1, kind: 'a', detail: null },
      ]).map(event => event.kind),
    ).toEqual(['a', 'b'])
  })
})
