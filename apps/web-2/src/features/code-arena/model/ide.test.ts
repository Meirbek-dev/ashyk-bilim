import { describe, expect, test } from 'vite-plus/test'

import { clampSplit, consoleMode, firstDifference } from './ide'

describe('B-COD-29 B-COD-30 B-COD-31 the workspace', () => {
  test('B-COD-31 the first differing line of the output, compared as the judge does', () => {
    expect(firstDifference('3\n7\n', '3\n7')).toBeNull()
    expect(firstDifference('3\r\n7', '3\n7\n\n')).toBeNull()
    expect(firstDifference('3\n7', '3\n8')).toBe(1)
    expect(firstDifference('3\n7', '3')).toBe(1)
    expect(firstDifference('3', '3\n4')).toBe(1)
    expect(firstDifference('hello', 'hello ')).toBe(0)
  })

  test('B-COD-30 the divider keeps both panes on the screen', () => {
    expect(clampSplit(0.1)).toBe(0.3)
    expect(clampSplit(0.99)).toBe(0.85)
    expect(clampSplit(0.5)).toBe(0.5)
    expect(clampSplit(Number.NaN)).toBe(0.62)
  })

  test('B-COD-29 the console opens on the result once there is a run, else on the samples', () => {
    expect(consoleMode(undefined, undefined)).toBe('cases')
    expect(consoleMode(undefined, 'run_1')).toBe('result')
    expect(consoleMode('input', 'run_1')).toBe('input')
  })
})
