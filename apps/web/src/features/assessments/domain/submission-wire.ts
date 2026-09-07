import { StudentSubmission } from '@/lib/api/generated/zod'
import type { SaveDraftRequest } from '@/lib/api/generated/zod'
import { unixToIso } from '@/lib/api/contract'
import type { ItemAnswer } from './items'

// The item editor uses uppercase discriminants; keep this conversion at the wire boundary.
export function answersToWire(answers: Record<string, ItemAnswer>): SaveDraftRequest['answers'] {
  return Object.fromEntries(
    Object.entries(answers).map(([id, answer]) => {
      switch (answer.kind) {
        case 'CHOICE': {
          return [id, { kind: 'choice', selected: answer.selected }]
        }
        case 'OPEN_TEXT': {
          return [id, { kind: 'open_text', text: answer.text }]
        }
        case 'FORM': {
          return [id, { kind: 'form', values: answer.values }]
        }
        case 'CODE': {
          return [id, { kind: 'code', language: answer.language, source: answer.source }]
        }
        case 'MATCHING': {
          return [id, { kind: 'matching', matches: answer.matches }]
        }
      }
    }),
  )
}

export function submissionFromWire(value: unknown) {
  const submission = StudentSubmission.parse(value)
  const answers: Record<string, ItemAnswer> = {}
  for (const [id, answer] of Object.entries(submission.answers)) {
    switch (answer.kind) {
      case 'choice': {
        answers[id] = { kind: 'CHOICE', selected: answer.selected ?? [] }
        break
      }
      case 'open_text': {
        answers[id] = { kind: 'OPEN_TEXT', text: answer.text ?? '' }
        break
      }
      case 'form': {
        answers[id] = { kind: 'FORM', values: answer.values ?? {} }
        break
      }
      case 'code': {
        answers[id] = { kind: 'CODE', language: answer.language, source: answer.source ?? '' }
        break
      }
      case 'matching': {
        answers[id] = { kind: 'MATCHING', matches: answer.matches ?? [] }
        break
      }
    }
  }
  const statuses = {
    draft: 'DRAFT',
    pending: 'PENDING',
    graded: 'GRADED',
    published: 'PUBLISHED',
    returned: 'RETURNED',
  } as const
  return {
    ...submission,
    status: statuses[submission.status],
    submission_uuid: submission.id,
    answers_json: { answers },
    started_at: unixToIso(submission.started_at_unix),
    submitted_at: unixToIso(submission.submitted_at_unix),
    created_at: unixToIso(submission.started_at_unix) ?? '',
    updated_at: unixToIso(submission.submitted_at_unix ?? submission.started_at_unix) ?? '',
  }
}

export type AssessmentSubmissionRead = ReturnType<typeof submissionFromWire>
