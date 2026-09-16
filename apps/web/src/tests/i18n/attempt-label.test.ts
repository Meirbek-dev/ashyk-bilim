// UX-099: one attempt label per locale — the review list, the review
// inspector, the exam history and the file history must not disagree
// («Попытка #2» vs «№2», kk «Әрекет №1» vs «#2 әрекет»).
import { describe, expect, it } from 'vite-plus/test'

import enMessages from '@/messages/en-US.json'
import kkMessages from '@/messages/kk-KZ.json'
import ruMessages from '@/messages/ru-RU.json'

type Catalog = typeof ruMessages

const attemptLabels = (m: Catalog) => [
  m.Activities.ExamActivity.attemptNumber,
  m.Features.Grading.Review.submissionList.attemptNumber,
  m.Features.Grading.Review.submissionInspector.attemptNumber,
  m.Features.Assessments.Attempt.Exam.attemptNumber,
  m.FileSubmission.attemptNumber,
]

describe('attempt label (UX-099)', () => {
  it.each([
    ['ru', ruMessages, 'Попытка №{number}'],
    ['kk', kkMessages as unknown as Catalog, '№{number} әрекет'],
    ['en', enMessages as unknown as Catalog, 'Attempt #{number}'],
  ])('%s uses one spelling everywhere', (_locale, messages, expected) => {
    expect(new Set(attemptLabels(messages))).toEqual(new Set([expected]))
  })

  // UX-100: teacher file review rows («Попытка 2 · 1 файл») used a third spelling.
  it.each([
    ['ru', ruMessages, 'Попытка №{attemptNumber} · '],
    ['kk', kkMessages as unknown as Catalog, '№{attemptNumber} әрекет · '],
    ['en', enMessages as unknown as Catalog, 'Attempt #{attemptNumber} · '],
  ])('%s file review rows start with the same label', (_locale, messages, prefix) => {
    expect(messages.FileSubmissionReview.attemptInfo.startsWith(prefix)).toBe(true)
  })

  it('names the unsaved-changes dialog with ё and a «leave» verb', () => {
    expect(ruMessages.Common.unsavedChanges).toBe('Несохранённые изменения')
    expect(ruMessages.Common.leaveWithoutSaving).toBe('Выйти без сохранения')
  })
})
