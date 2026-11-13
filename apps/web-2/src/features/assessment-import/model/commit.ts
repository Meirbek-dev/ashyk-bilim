import * as v from 'valibot'

import { m } from '#/paraglide/messages'
import type {
  AssessmentImport,
  CommitImportRequest,
  DrawStratum,
  ImportSettings,
  PlannedItem,
} from '#/shared/api/gen/types.gen'

// The "create" form of the preview: the file's row 1 as typed text (as DOT teachers know it: 0 means "no limit"), and
// back to the commit body. Numbers are checked against the server's ranges here, so a refusal names the field.

/** Where the questions go: a new test in a chapter, or an existing draft test of the course. */
export type ImportDestination = { into: 'new' } | { into: 'test'; assessmentId: string; activityId: string }

export type CommitForm = {
  title: string
  kind: 'quiz' | 'exam'
  chapter_id: string
  /** An existing test: its questions are replaced or the file's are added after them. */
  mode: 'replace' | 'append'
  /** An existing test: also take the file's settings (a new test always does). */
  apply_settings: boolean
  /** Blank or 0: unlimited. */
  max_attempts: string
  /** Blank or 0: no limit. */
  time_limit_minutes: string
  /** Blank, 0 or every question: no draw. */
  draw_count: string
  partial_credit: boolean
  passing_score: string
}

/** The server's caps (MAX_ATTEMPTS, a day of time limit, MAX_DRAW). */
const MAX_ATTEMPTS = 10
const MAX_MINUTES = 1440
const MAX_DRAW = 200
const MAX_TITLE = 200
/** DOT has no passing score; Ashyq's default. */
const DEFAULT_PASSING_SCORE = 50

const text = (value: number | null | undefined): string => (value ? String(value) : '')

export function commitDefaults(
  imported: Pick<AssessmentImport, 'settings'>,
  chapterId: string | undefined,
  mode: CommitForm['mode'] = 'replace',
): CommitForm {
  const settings = imported.settings
  return {
    title: settings?.title ?? '',
    kind: 'exam',
    chapter_id: chapterId ?? '',
    mode,
    apply_settings: false,
    max_attempts: text(settings?.max_attempts),
    time_limit_minutes: settings?.time_limit_seconds ? String(Math.ceil(settings.time_limit_seconds / 60)) : '',
    draw_count: text(settings?.draw_count),
    partial_credit: false,
    passing_score: String(DEFAULT_PASSING_SCORE),
  }
}

/** A blank, 0 or a value at or past `all` means "no limit": `null`. */
function limit(value: string, all = Number.POSITIVE_INFINITY): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const number = Number(trimmed)
  return number <= 0 || number >= all ? null : number
}

/**
 * DOT's level quotas for a draw of `count` (draw.rs `dot_quotas`): each level's share of the draw, at most the
 * questions it has and what is left. The quotas may add up to less than the draw; the rest is drawn freely.
 */
export function dotQuotas(count: number, items: readonly Pick<PlannedItem, 'draw_group'>[]): DrawStratum[] {
  const shares: [string, number, number][] = [
    ['1', 3, 10],
    ['2', 4, 10],
    ['3', 3, 10],
    ['101', 1, 2],
    ['102', 1, 2],
    ['201', 2, 3],
    ['202', 1, 3],
  ]
  let left = Math.max(count, 0)
  const out: DrawStratum[] = []
  for (const [group, num, den] of shares) {
    const have = items.filter(item => item.draw_group === group).length
    if (have === 0) continue
    const quota = Math.min(Math.floor((Math.max(count, 0) * num) / den), have, left)
    if (quota > 0) {
      left -= quota
      out.push({ group, count: quota })
    }
  }
  return out
}

/** The quotas for the chosen draw: the file's when the draw is the file's, recomputed when the teacher changed it. */
function strata(drawCount: number | null, settings: ImportSettings | null, items: readonly PlannedItem[]) {
  if (drawCount === null || !settings?.leveling) return []
  return drawCount === settings.draw_count ? settings.draw_strata : dotQuotas(drawCount, items)
}

/** The commit body: the form over the file's settings; an existing test takes settings only when asked. */
export function commitBody(
  form: CommitForm,
  imported: Pick<AssessmentImport, 'settings' | 'items'>,
  destination: ImportDestination,
): CommitImportRequest {
  const minutes = limit(form.time_limit_minutes)
  const drawCount = limit(form.draw_count, imported.items.length)
  const settings = {
    max_attempts: limit(form.max_attempts),
    time_limit_seconds: minutes === null ? null : minutes * 60,
    draw_count: drawCount,
    draw_strata: strata(drawCount, imported.settings, imported.items),
    partial_credit: form.partial_credit,
    passing_score: Number(form.passing_score.trim().replace(',', '.')),
  }
  if (destination.into === 'new')
    return {
      target: { mode: 'new', chapter_id: form.chapter_id, kind: form.kind },
      title: form.title.trim(),
      ...settings,
    }
  const target = { mode: form.mode, assessment_id: destination.assessmentId }
  return form.apply_settings ? { target, apply_settings: true, ...settings } : { target }
}

const optionalWhole = v.pipe(v.string(), v.trim(), v.regex(/^\d*$/u))
const within = (max: number) =>
  v.rawCheck<string>(({ dataset, addIssue }) => {
    if (dataset.typed && Number(dataset.value.trim() || 0) > max)
      addIssue({ message: m.validation_max_value({ max: String(max) }) })
  })

/** A draw of every question is no draw (any size); a real draw is at most MAX_DRAW. */
const drawWithin = (questions: number) =>
  v.rawCheck<string>(({ dataset, addIssue }) => {
    if (!dataset.typed) return
    const count = Number(dataset.value.trim() || 0)
    if (count > questions) addIssue({ message: m.validation_max_value({ max: String(questions) }) })
    else if (count < questions && count > MAX_DRAW)
      addIssue({ message: m.validation_max_value({ max: String(MAX_DRAW) }) })
  })

/**
 * The form's schema: a new test needs a title and a chapter; the draw is at most the questions there are. An existing
 * test checks the settings only when it takes them (hidden fields never block the load).
 */
export function commitFormSchema(destination: ImportDestination, questions: number) {
  const isNew = destination.into === 'new'
  const base = {
    title: isNew ? v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(MAX_TITLE)) : v.string(),
    kind: v.picklist(['quiz', 'exam']),
    chapter_id: isNew ? v.pipe(v.string(), v.minLength(1)) : v.string(),
    mode: v.picklist(['replace', 'append']),
    partial_credit: v.boolean(),
  }
  const checked = {
    ...base,
    max_attempts: v.pipe(optionalWhole, within(MAX_ATTEMPTS)),
    time_limit_minutes: v.pipe(optionalWhole, within(MAX_MINUTES)),
    draw_count: v.pipe(optionalWhole, drawWithin(questions)),
    passing_score: v.pipe(
      v.string(),
      v.trim(),
      v.regex(/^\d+([.,]\d+)?$/u),
      v.check(value => Number(value.replace(',', '.')) <= 100, m.validation_max_value({ max: '100' })),
    ),
  }
  if (isNew) return v.object({ ...checked, apply_settings: v.boolean() })
  const unchecked = {
    ...base,
    max_attempts: v.string(),
    time_limit_minutes: v.string(),
    draw_count: v.string(),
    passing_score: v.string(),
  }
  return v.variant('apply_settings', [
    v.object({ ...checked, apply_settings: v.literal(true) }),
    v.object({ ...unchecked, apply_settings: v.literal(false) }),
  ])
}
