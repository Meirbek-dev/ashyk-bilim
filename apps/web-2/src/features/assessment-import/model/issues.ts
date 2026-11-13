import { m } from '#/paraglide/messages'
import type { AssessmentImport, ImportIssue, IssueSeverity } from '#/shared/api/gen/types.gen'
import { formatNumber } from '#/shared/i18n/format'

// The server locates a problem (`code`, `cell`, `row`, `params`); the words are ours (docs/XLSX-TEST-IMPORT.md
// section 10). A line reads like DOT's, `{sheet} → {cell}: {text}`, so teachers recognize it. A code this client does
// not know yet still gets a line (the generic text), never an exception.

type Params = NonNullable<ImportIssue['params']>

export const SEVERITIES: readonly IssueSeverity[] = ['error', 'warning', 'info']

/** A cell list (`A53, A54`) stays one line: the first dozen, then how many more. */
const CELLS_SHOWN = 12

function plain(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return formatNumber(value)
  if (typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(plain).join(', ')
  return ''
}

const count = (value: unknown): number => (typeof value === 'number' ? value : Number(value) || 0)

function cellList(value: unknown): string {
  const cells = Array.isArray(value) ? value.map(plain) : [plain(value)]
  const rest = cells.length - CELLS_SHOWN
  return rest > 0 ? `${cells.slice(0, CELLS_SHOWN).join(', ')} … (+${formatNumber(rest)})` : cells.join(', ')
}

const quotedList = (value: unknown): string =>
  (Array.isArray(value) ? value : [value]).map(name => m.assessment_import_quoted({ text: plain(name) })).join(', ')

/** The two characters DOT reads as a line break; passed as a value so no catalog has to escape a backslash. */
export const NEWLINE_TOKEN = '\\n'
const QUOTE_TOKEN = '\\"'

const texts: Record<string, (p: Params) => string> = {
  // Errors: the file as a whole.
  file_too_large: p => m.assessment_import_issue_file_too_large({ max_mb: plain(p['max_mb']) }),
  xls_not_supported: () => m.assessment_import_issue_xls_not_supported(),
  file_unreadable: () => m.assessment_import_issue_file_unreadable(),
  too_many_questions: p => m.assessment_import_issue_too_many_questions({ max: plain(p['max']) }),
  too_many_images: p => m.assessment_import_issue_too_many_images({ max: plain(p['max']) }),
  too_many_options: p => m.assessment_import_issue_too_many_options({ max: plain(p['max']) }),
  // Errors: row 1.
  no_title: () => m.assessment_import_issue_no_title(),
  not_non_negative_int: () => m.assessment_import_issue_not_non_negative_int(),
  leveling_cell: () => m.assessment_import_issue_leveling_cell(),
  limit_too_big: p => m.assessment_import_issue_limit_too_big({ total: plain(p['total']) }),
  no_questions: () => m.assessment_import_issue_no_questions(),
  // Errors: cells and questions.
  formula: () => m.assessment_import_issue_formula(),
  cell_error: p => m.assessment_import_issue_cell_error({ value: plain(p['value']) }),
  no_question: () => m.assessment_import_issue_no_question(),
  type_invalid: () => m.assessment_import_issue_type_invalid(),
  level_invalid: p => m.assessment_import_issue_level_invalid({ cell: plain(p['cell']) }),
  level_disabled: p => m.assessment_import_issue_level_disabled({ cell: plain(p['cell']) }),
  empty_between: () => m.assessment_import_issue_empty_between(),
  no_options: () => m.assessment_import_issue_no_options(),
  too_few_options: p => m.assessment_import_issue_too_few_options({ min: plain(p['min']) }),
  options_not_distinct: p => m.assessment_import_issue_options_not_distinct({ a: plain(p['a']), b: plain(p['b']) }),
  correct_format: () => m.assessment_import_issue_correct_format(),
  single_needs_one: () => m.assessment_import_issue_single_needs_one(),
  correct_repeated: () => m.assessment_import_issue_correct_repeated(),
  correct_out_of_range: p =>
    m.assessment_import_issue_correct_out_of_range({ item: plain(p['item']), total: plain(p['total']) }),
  no_text_answer: () => m.assessment_import_issue_no_text_answer(),
  matching_counts_format: () => m.assessment_import_issue_matching_counts_format(),
  matching_counts_mismatch: p =>
    m.assessment_import_issue_matching_counts_mismatch({
      left: plain(p['left']),
      right: plain(p['right']),
      total: plain(p['total']),
    }),
  matching_pair_format: p => m.assessment_import_issue_matching_pair_format({ pair: plain(p['pair']) }),
  matching_pair_repeated: p => m.assessment_import_issue_matching_pair_repeated({ left: plain(p['left']) }),
  matching_pair_out_of_range: p =>
    m.assessment_import_issue_matching_pair_out_of_range({
      left: plain(p['left']),
      right: plain(p['right']),
      row: plain(p['row']),
    }),
  matching_pairs_incomplete: () => m.assessment_import_issue_matching_pairs_incomplete(),
  image_format: () => m.assessment_import_issue_image_format(),
  image_broken: () => m.assessment_import_issue_image_broken(),
  image_too_large: () => m.assessment_import_issue_image_too_large(),
  option_image_twice: () => m.assessment_import_issue_option_image_twice(),
  image_outside: () => m.assessment_import_issue_image_outside(),
  text_too_long: p => m.assessment_import_issue_text_too_long({ max: plain(p['max']) }),
  // Warnings.
  service_cell: () => m.assessment_import_issue_service_cell(),
  bold_mismatch: p => m.assessment_import_issue_bold_mismatch({ bold: plain(p['bold']), correct: plain(p['correct']) }),
  duplicate_question: p => m.assessment_import_issue_duplicate_question({ row: plain(p['row']) }),
  suspicious_escape: () => m.assessment_import_issue_suspicious_escape({ token: QUOTE_TOKEN }),
  number_format: p => m.assessment_import_issue_shown_differently({ value: plain(p['value']) }),
  boolean_cell: p => m.assessment_import_issue_shown_differently({ value: plain(p['value']) }),
  merged_cells: p => m.assessment_import_issue_merged_cells({ range: plain(p['range']) }),
  hidden_cells: p =>
    p['column'] === undefined
      ? m.assessment_import_issue_hidden_row({ row: plain(p['row']) })
      : m.assessment_import_issue_hidden_column({ column: plain(p['column']) }),
  attempts_capped: p => m.assessment_import_issue_attempts_capped({ max: plain(p['max']) }),
  manual_grading: p => m.assessment_import_issue_manual_grading({ n: count(p['n']) }),
  matching_image_dropped: () => m.assessment_import_issue_matching_image_dropped(),
  // Notes.
  unescaped_newlines: p =>
    m.assessment_import_issue_unescaped_newlines({ token: NEWLINE_TOKEN, cells: cellList(p['cells']) }),
  trimmed: p =>
    m.assessment_import_issue_trimmed({ count: formatNumber(count(p['count'])), cells: cellList(p['cells']) }),
  shapes_skipped: p => m.assessment_import_issue_shapes_skipped({ cells: cellList(p['cells']) }),
  other_sheets: p =>
    m.assessment_import_issue_other_sheets({ sheet: plain(p['sheet']), names: quotedList(p['names']) }),
}

/** What the issue says, in the interface language. */
export function issueText(issue: ImportIssue): string {
  const text = Object.hasOwn(texts, issue.code) ? texts[issue.code] : undefined
  return text ? text(issue.params ?? {}) : m.assessment_import_issue_unknown({ code: issue.code })
}

/** `{sheet} → {cell}: {text}` as DOT writes it; a file-level issue names only the sheet (or nothing). */
export function issueLine(issue: ImportIssue, sheet: string): string {
  const where = [sheet, issue.cell].filter(Boolean).join(' → ')
  return where ? `${where}: ${issueText(issue)}` : issueText(issue)
}

/** Errors, then warnings, then notes; the server's order (row, column) inside each. */
export function bySeverity(issues: readonly ImportIssue[]): Record<IssueSeverity, ImportIssue[]> {
  const groups: Record<IssueSeverity, ImportIssue[]> = { error: [], warning: [], info: [] }
  for (const issue of issues) groups[issue.severity].push(issue)
  return groups
}

/** The issues of each question row (row 1 is the settings row). */
export function issuesByRow(issues: readonly ImportIssue[]): Map<number, ImportIssue[]> {
  const rows = new Map<number, ImportIssue[]>()
  const groups = bySeverity(issues)
  for (const issue of SEVERITIES.flatMap(severity => groups[severity])) {
    if (issue.row === undefined) continue
    const list = rows.get(issue.row)
    if (list) list.push(issue)
    else rows.set(issue.row, [issue])
  }
  return rows
}

/** The element an issue points at: its question card, the settings for row 1, none for the whole file. */
export function issueAnchor(issue: ImportIssue): string | null {
  if (issue.row === undefined) return null
  return issue.row === 1 ? SETTINGS_ANCHOR : rowAnchor(issue.row)
}

export const SETTINGS_ANCHOR = 'import-settings'
export const rowAnchor = (row: number) => `import-row-${row}`

/** «Скопировать список»: one line per issue, grouped as on the page, to fix the file beside it. */
export function issuesReport(imported: Pick<AssessmentImport, 'issues' | 'issues_truncated' | 'sheet'>): string {
  const groups = bySeverity(imported.issues)
  const lines = SEVERITIES.flatMap(severity => groups[severity].map(issue => issueLine(issue, imported.sheet)))
  if (imported.issues_truncated > 0)
    lines.push(m.assessment_import_truncated({ count: formatNumber(imported.issues_truncated) }))
  return lines.join('\n')
}
