import { describe, expect, test } from 'vite-plus/test'

import {
  bufferedEnd,
  clampVolume,
  commandFor,
  nextRate,
  rememberPosition,
  resumeAt,
  seekTarget,
  type KeyPress,
} from './video-player'

const key = (code: string, extra: Partial<KeyPress> = {}): KeyPress => ({
  code,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...extra,
})

const ranges = (...pairs: [number, number][]) => ({
  length: pairs.length,
  start: (index: number) => pairs[index]?.[0] ?? 0,
  end: (index: number) => pairs[index]?.[1] ?? 0,
})

describe('video player', () => {
  test('B-EDT-19 keys map to player commands by physical key, in any layout', () => {
    expect(commandFor(key('KeyK'), 'player')).toEqual({ kind: 'toggle' })
    expect(commandFor(key('Space'), 'player')).toEqual({ kind: 'toggle' })
    expect(commandFor(key('KeyJ'), 'player')).toEqual({ kind: 'seek-by', seconds: -10 })
    expect(commandFor(key('ArrowRight'), 'player')).toEqual({ kind: 'seek-by', seconds: 5 })
    expect(commandFor(key('ArrowUp'), 'player')).toEqual({ kind: 'volume-by', delta: 0.1 })
    expect(commandFor(key('Digit5'), 'player')).toEqual({ kind: 'seek-to', fraction: 0.5 })
    expect(commandFor(key('Numpad0'), 'player')).toEqual({ kind: 'seek-to', fraction: 0 })
    expect(commandFor(key('Period', { shiftKey: true }), 'player')).toEqual({ kind: 'rate', step: 1 })
    expect(commandFor(key('Comma', { shiftKey: true }), 'player')).toEqual({ kind: 'rate', step: -1 })
    expect(commandFor(key('KeyF'), 'player')).toEqual({ kind: 'fullscreen' })
    expect(commandFor(key('KeyM'), 'player')).toEqual({ kind: 'mute' })
  })

  test('B-EDT-19 browser shortcuts and the keys of a focused control are left alone', () => {
    expect(commandFor(key('KeyK', { ctrlKey: true }), 'player')).toBeNull()
    expect(commandFor(key('KeyF', { metaKey: true }), 'player')).toBeNull()
    expect(commandFor(key('KeyQ'), 'player')).toBeNull()
    expect(commandFor(key('KeyK', { shiftKey: true }), 'player')).toBeNull()
    for (const code of ['Space', 'Enter']) expect(commandFor(key(code), 'button')).toBeNull()
    for (const code of ['ArrowLeft', 'ArrowUp', 'Home', 'PageDown']) expect(commandFor(key(code), 'slider')).toBeNull()
    expect(commandFor(key('ArrowRight'), 'button')).toEqual({ kind: 'seek-by', seconds: 5 })
    expect(commandFor(key('Space'), 'slider')).toEqual({ kind: 'toggle' })
    expect(commandFor(key('KeyK'), 'slider')).toEqual({ kind: 'toggle' })
  })

  test('B-EDT-19 speed steps along the menu list and stops at its ends', () => {
    expect(nextRate(1, 1)).toBe(1.25)
    expect(nextRate(1, -1)).toBe(0.75)
    expect(nextRate(2, 1)).toBe(2)
    expect(nextRate(0.5, -1)).toBe(0.5)
    expect(nextRate(1.1, 1)).toBe(1.25)
    expect(nextRate(1.1, -1)).toBe(1)
  })

  test('B-EDT-19 seeks stay inside the video and wait for its duration', () => {
    expect(seekTarget(3, 60, { kind: 'seek-by', seconds: -10 })).toBe(0)
    expect(seekTarget(55, 60, { kind: 'seek-by', seconds: 10 })).toBe(60)
    expect(seekTarget(0, 60, { kind: 'seek-to', fraction: 0.3 })).toBeCloseTo(18)
    expect(seekTarget(0, Number.NaN, { kind: 'seek-by', seconds: 10 })).toBeNull()
    expect(seekTarget(0, 60, { kind: 'mute' })).toBeNull()
    expect(clampVolume(1.04)).toBe(1)
    expect(clampVolume(-0.1)).toBe(0)
    expect(clampVolume(0.3 + 0.1)).toBe(0.4)
  })

  test('B-EDT-19 the loaded-ahead mark is the end of the buffered range around the playhead', () => {
    expect(bufferedEnd(ranges([0, 12], [30, 45]), 5)).toBe(12)
    expect(bufferedEnd(ranges([0, 12], [30, 45]), 31)).toBe(45)
    expect(bufferedEnd(ranges([0, 12], [30, 45]), 20)).toBe(0)
    expect(bufferedEnd(ranges(), 0)).toBe(0)
  })

  test('B-EDT-19 a video continues where it was left unless that is near either end', () => {
    expect(resumeAt(120, 600)).toBe(120)
    expect(resumeAt(3, 600)).toBeNull()
    expect(resumeAt(597, 600)).toBeNull()
    expect(resumeAt(undefined, 600)).toBeNull()
    expect(resumeAt(120, Number.NaN)).toBeNull()
  })

  test('B-EDT-19 positions are dropped when a video is finished and capped to the newest fifty', () => {
    const watched = rememberPosition({}, '/content/a.mp4', 90, 600, 1)
    expect(watched).toEqual({ '/content/a.mp4': { time: 90, at: 1 } })
    expect(rememberPosition(watched, '/content/a.mp4', 598, 600, 2)).toEqual({})
    const many = Object.fromEntries(Array.from({ length: 50 }, (_, at) => [`/content/${at}.mp4`, { time: 60, at }]))
    const next = rememberPosition(many, '/content/new.mp4', 60, 600, 100)
    expect(Object.keys(next)).toHaveLength(50)
    expect(next['/content/new.mp4']).toEqual({ time: 60, at: 100 })
    expect(next['/content/0.mp4']).toBeUndefined()
  })
})
