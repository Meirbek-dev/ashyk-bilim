import * as v from 'valibot'

/** The editor's text size: the type scale's xs, sm and base (DESIGN 4). */
export const FONT_SIZES = ['sm', 'md', 'lg'] as const
export type FontSize = (typeof FONT_SIZES)[number]

/** What a learner tunes once and keeps on every challenge (B-COD-30). */
export const prefsSchema = v.object({
  fontSize: v.fallback(v.picklist(FONT_SIZES), 'md'),
  tabSize: v.fallback(v.picklist([2, 4]), 4),
  wrap: v.fallback(v.boolean(), false),
  /** The editor's share of the workspace height; the console takes the rest. */
  split: v.fallback(v.number(), 0.62),
})
export type EditorPrefs = v.InferOutput<typeof prefsSchema>

export const DEFAULT_PREFS: EditorPrefs = { fontSize: 'md', tabSize: 4, wrap: false, split: 0.62 }

/** Neither pane can be dragged away: the editor keeps 30-85% of the height. */
export const clampSplit = (share: number) => Math.min(0.85, Math.max(0.3, Number.isFinite(share) ? share : 0.62))

/** One step of the divider from the keyboard (arrows), as a share of the height. */
export const SPLIT_STEP = 0.05

/** The console's modes (B-COD-29): the sample tests, an own input, the last run's result. */
export const CONSOLE_MODES = ['cases', 'input', 'result'] as const
export type ConsoleMode = (typeof CONSOLE_MODES)[number]

/** Without `?console=`: the result once there is a run to show, the samples before that. */
export const consoleMode = (mode: ConsoleMode | undefined, run: string | undefined): ConsoleMode =>
  mode ?? (run ? 'result' : 'cases')

const lines = (text: string) => text.replace(/^[\r\n]+|[\r\n]+$/g, '').split(/\r?\n/)

/**
 * The first line where the program's output departs from the expected one (0-based), or null when they agree. Both
 * lose their leading and trailing line breaks, as the judge compares them; a missing line is a difference (B-COD-31).
 */
export function firstDifference(expected: string, actual: string): number | null {
  const want = lines(expected)
  const got = lines(actual)
  const longest = Math.max(want.length, got.length)
  for (let line = 0; line < longest; line += 1) if (want[line] !== got[line]) return line
  return null
}
