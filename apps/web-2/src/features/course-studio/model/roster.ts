import type { CourseLearner, EnrollLearnerResult, EnrollOutcome } from '#/shared/api/gen/types.gen'

/** Most identifiers one `POST /courses/{id}/learners` takes (`EnrollLearnersRequest.identifiers`). */
export const MAX_ROSTER = 1000

/** The CSV a teacher picks is read in the page: Excel exports of a class list stay well under this. */
export const MAX_ROSTER_FILE_BYTES = 1024 * 1024

const HEADER = /^(e-?mail|почта|эл\.?\s*почта|электронная почта|username|login|логин|user|пользователь|пайдаланушы)$/i

const unquote = (cell: string) =>
  cell
    .trim()
    .replace(/^"(.*)"$/s, '$1')
    .replaceAll('""', '"')
    .trim()

/** A pasted list: emails or usernames separated by new lines, commas, semicolons or tabs. */
export const parsePasted = (text: string): string[] =>
  text
    .split(/[\r\n,;\t]+/)
    .map(unquote)
    .filter(Boolean)

/** File bytes as text: UTF-8, else Windows-1251 (the plain «CSV» of a Russian Excel). */
export function decodeCsv(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1251').decode(bytes)
  }
}

/**
 * A class list CSV: `;` (Excel in ru/kk) or `,` delimited, an optional header row. Each row gives one identifier: the
 * cell with an email, else the first non-empty cell.
 */
export function parseRosterCsv(text: string): string[] {
  const lines = text
    .replace(/^﻿/, '')
    .split(/\r\n|\n|\r/)
    .filter(line => line.trim())
  const first = lines[0] ?? ''
  const delimiter = (first.match(/;/g)?.length ?? 0) >= (first.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows = lines.map(line => line.split(delimiter).map(unquote).filter(Boolean))
  const head = rows[0] ?? []
  if (head.some(cell => HEADER.test(cell)) && !head.some(cell => cell.includes('@'))) rows.shift()
  return rows.map(cells => cells.find(cell => cell.includes('@')) ?? cells[0] ?? '').filter(Boolean)
}

export const OUTCOMES = [
  'enrolled',
  'already_enrolled',
  'duplicate',
  'not_found',
  'course_staff',
  'account_disabled',
] as const satisfies readonly EnrollOutcome[]

/** The report: how many identifiers ended in each outcome, and the ones that were not enrolled, in request order. */
export function summarize(results: readonly EnrollLearnerResult[]) {
  const counts: Record<EnrollOutcome, number> = {
    enrolled: 0,
    already_enrolled: 0,
    duplicate: 0,
    not_found: 0,
    course_staff: 0,
    account_disabled: 0,
  }
  for (const result of results) counts[result.outcome] += 1
  const problems = results.filter(result => !['enrolled', 'already_enrolled'].includes(result.outcome))
  return { counts, problems }
}

/**
 * One CSV cell: RFC 4180 quoting and a `'` before what a spreadsheet would run as a formula (the server's
 * `ab_domain::csv::csv_field`, BUG-196).
 */
const csvField = (value: string) => `"${(/^[=+\-@\t\r]/.test(value) ? `'${value}` : value).replaceAll('"', '""')}"`

/**
 * The learners as Excel opens them: UTF-8 BOM (Cyrillic), CRLF rows, `;` and a decimal comma in ru/kk, `,` in en.
 * `header` and the dates come formatted by the caller.
 */
export function rosterCsv(
  header: readonly string[],
  learners: readonly CourseLearner[],
  date: (unix: number) => string,
  english: boolean,
): string {
  const progress = (pct: number | null) =>
    pct === null
      ? ''
      : english
        ? String(Math.round(pct * 10) / 10)
        : String(Math.round(pct * 10) / 10).replace('.', ',')
  const rows = [
    header,
    ...learners.map(learner => [
      learner.display_name,
      learner.username,
      learner.email,
      date(learner.enrolled_at_unix),
      progress(learner.progress_pct),
      learner.completed_at_unix === null ? '' : date(learner.completed_at_unix),
    ]),
  ]
  const text = rows.map(row => row.map(csvField).join(english ? ',' : ';')).join('\r\n')
  return `﻿${text}\r\n`
}
