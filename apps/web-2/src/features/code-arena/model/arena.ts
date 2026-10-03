import type {
  AssessmentDetail,
  AssessmentItem,
  CodeBody,
  LanguageInfo,
  StudentSubmission,
} from '#/shared/api/gen/types.gen'

export type CodeItem = { item: AssessmentItem; body: CodeBody }
export type CodeAnswer = { language: number; source: string }

/** The challenge's code item (a code challenge holds one; the server creates it with the challenge). */
export function findCodeItem(assessment: Pick<AssessmentDetail, 'items'> | null): CodeItem | null {
  for (const item of assessment?.items ?? []) {
    if (item.body.kind === 'code') return { item, body: item.body }
  }
  return null
}

/** The code item a learner can work on; null when it is missing or allows no language (B-COD-02). */
export function codeItemOf(assessment: Pick<AssessmentDetail, 'items'> | null): CodeItem | null {
  const code = findCodeItem(assessment)
  return code && (code.body.languages ?? []).length > 0 ? code : null
}

/** The open attempt: the list holds at most one draft. */
export const draftOf = (attempts: StudentSubmission[]) => attempts.find(attempt => attempt.status === 'draft')

export function answerOf(attempt: StudentSubmission | undefined, itemId: string): CodeAnswer | null {
  const answer = attempt?.answers[itemId]
  return answer?.kind === 'code' ? { language: answer.language, source: answer.source ?? '' } : null
}

const starterOf = (body: CodeBody, language: number) => body.starter_code?.[String(language)] ?? ''

/** The editor's first state: the draft's code in an allowed language, else the first language's starter code. */
export function initialAnswer(body: CodeBody, saved: CodeAnswer | null): CodeAnswer {
  const allowed = body.languages ?? []
  if (saved && allowed.includes(saved.language)) return saved
  const language = allowed[0] ?? 0
  return { language, source: starterOf(body, language) }
}

/** Code the learner has not touched (blank or the starter) follows the new language's starter; theirs stays. */
export function switchLanguage(body: CodeBody, current: CodeAnswer, language: number): CodeAnswer {
  const untouched = current.source.trim() === '' || current.source === starterOf(body, current.language)
  return { language, source: untouched ? starterOf(body, language) : current.source }
}

/** A write answers with the attempt: it replaces its row (or leads the list, newest first). */
export function upsertAttempt(list: StudentSubmission[], attempt: StudentSubmission): StudentSubmission[] {
  return list.some(row => row.id === attempt.id)
    ? list.map(row => (row.id === attempt.id ? attempt : row))
    : [attempt, ...list]
}

/** "N of M tests passed" of a graded attempt (the grader's `tests-passed` verdict), null when not given. */
export function testsPassed(attempt: StudentSubmission): { correct: number; total: number } | null {
  const entry = attempt.grading?.items?.find(item => item.feedback_code === 'tests-passed')
  const correct = entry?.feedback_params?.['correct']
  const total = entry?.feedback_params?.['total']
  return typeof correct === 'number' && typeof total === 'number' ? { correct, total } : null
}

/** The platform's name of a language; null when the list is unavailable or does not hold it. */
export const languageOf = (languages: LanguageInfo[] | null, id: number) =>
  languages?.find(language => language.id === id) ?? null
