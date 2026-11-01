/** Playback speeds the speed menu offers; 1 is the normal speed. */
export const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const

/** The skip buttons, J and L; the arrow keys move half as far. */
export const SKIP_SECONDS = 10
const ARROW_SECONDS = 5
const VOLUME_STEP = 0.1

/** A position this close to either end is not worth continuing from: the lesson starts over. */
const RESUME_MARGIN_SECONDS = 5
/** Positions kept for the most recently watched videos; older ones drop out. */
const KEPT_POSITIONS = 50

export type Command =
  | { kind: 'toggle' }
  | { kind: 'seek-by'; seconds: number }
  | { kind: 'seek-to'; fraction: number }
  | { kind: 'volume-by'; delta: number }
  | { kind: 'mute' }
  | { kind: 'fullscreen' }
  | { kind: 'pip' }
  | { kind: 'rate'; step: 1 | -1 }

export type KeyPress = Pick<KeyboardEvent, 'code' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey'>

/** Where the key was pressed: a button presses on Space and Enter, a slider moves on arrows, Home and End. */
export type KeyTarget = 'player' | 'button' | 'slider'

const OWN_KEYS: Record<KeyTarget, Set<string>> = {
  player: new Set(),
  button: new Set(['Space', 'Enter']),
  slider: new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']),
}

const LETTERS: Record<string, Command> = {
  KeyK: { kind: 'toggle' },
  Space: { kind: 'toggle' },
  KeyJ: { kind: 'seek-by', seconds: -SKIP_SECONDS },
  KeyL: { kind: 'seek-by', seconds: SKIP_SECONDS },
  ArrowLeft: { kind: 'seek-by', seconds: -ARROW_SECONDS },
  ArrowRight: { kind: 'seek-by', seconds: ARROW_SECONDS },
  ArrowUp: { kind: 'volume-by', delta: VOLUME_STEP },
  ArrowDown: { kind: 'volume-by', delta: -VOLUME_STEP },
  Home: { kind: 'seek-to', fraction: 0 },
  End: { kind: 'seek-to', fraction: 1 },
  KeyM: { kind: 'mute' },
  KeyF: { kind: 'fullscreen' },
  KeyI: { kind: 'pip' },
}

/**
 * The player command for a key, or null to leave the key to the browser. Physical keys (`code`), so J/K/L work in
 * the Russian and Kazakh layouts too; `<` and `>` (Shift + comma/period) change speed, digits jump to tenths.
 * The keys the focused control acts on itself stay with it.
 */
export function commandFor(key: KeyPress, target: KeyTarget): Command | null {
  if (key.ctrlKey || key.metaKey || key.altKey) return null
  if (OWN_KEYS[target].has(key.code)) return null
  if (key.shiftKey) {
    if (key.code === 'Comma') return { kind: 'rate', step: -1 }
    if (key.code === 'Period') return { kind: 'rate', step: 1 }
    return null
  }
  const digit = /^(?:Digit|Numpad)(\d)$/.exec(key.code)?.[1]
  if (digit !== undefined) return { kind: 'seek-to', fraction: Number(digit) / 10 }
  return LETTERS[key.code] ?? null
}

/** The next speed up or down the menu's list from the current one (an odd rate snaps to its neighbour). */
export function nextRate(rate: number, step: 1 | -1): number {
  const index = step === 1 ? RATES.findIndex(value => value > rate) : RATES.findLastIndex(value => value < rate)
  return index === -1 ? rate : (RATES[index] ?? rate)
}

export const clampVolume = (volume: number) => Math.min(1, Math.max(0, Math.round(volume * 100) / 100))

/** Where a seek lands: inside the video, never past its end (that would fire `ended`) before metadata. */
export function seekTarget(time: number, duration: number, command: Command): number | null {
  if (!Number.isFinite(duration) || duration <= 0) return null
  if (command.kind === 'seek-by') return Math.min(duration, Math.max(0, time + command.seconds))
  if (command.kind === 'seek-to') return Math.min(duration, Math.max(0, duration * command.fraction))
  return null
}

/** Ranges as `HTMLMediaElement.buffered` holds them. */
type Ranges = Pick<TimeRanges, 'length' | 'start' | 'end'>

/** How far the browser has loaded ahead of the playhead: the end of the buffered range around it, 0 if none. */
export function bufferedEnd(ranges: Ranges, time: number): number {
  for (let index = 0; index < ranges.length; index++) {
    if (ranges.start(index) <= time + 0.5 && time <= ranges.end(index)) return ranges.end(index)
  }
  return 0
}

const worthResuming = (time: number, duration: number) =>
  Number.isFinite(duration) && time >= RESUME_MARGIN_SECONDS && time <= duration - RESUME_MARGIN_SECONDS

/** The saved place to continue from once the duration is known, or null to start at the beginning. */
export function resumeAt(saved: number | undefined, duration: number): number | null {
  return saved !== undefined && worthResuming(saved, duration) ? saved : null
}

/** A video's last position (seconds) and when it was saved (epoch ms), by file URL. */
export type Positions = Record<string, { time: number; at: number }>

/**
 * The positions after watching `src` up to `time`: kept while it is worth continuing from, dropped near either end
 * (a finished video starts over), at most the {@link KEPT_POSITIONS} newest.
 */
export function rememberPosition(positions: Positions, src: string, time: number, duration: number, now: number) {
  const { [src]: _previous, ...others } = positions
  const next: Positions = worthResuming(time, duration) ? { [src]: { time, at: now }, ...others } : others
  const newest = Object.entries(next)
    .toSorted(([, a], [, b]) => b.at - a.at)
    .slice(0, KEPT_POSITIONS)
  return Object.fromEntries(newest)
}
