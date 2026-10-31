import { describe, expect, test } from 'vite-plus/test'

import type { GradeDraftView, Proposal } from '#/shared/api/gen/types.gen'

import {
  anyQueued,
  approvable,
  approveFailures,
  draftsBySubject,
  isReady,
  transferToFileForm,
  transferToGradeForm,
} from './ai-draft'
import type { FileGradeForm, GradeForm } from './grade-form'

const proposal: Proposal = {
  auto_max: 50,
  auto_points: 40,
  calibration_corrections: 2,
  confidence: 0.8,
  flags: [],
  overall_feedback: 'Хорошо, но без примера.',
  parts: [
    {
      ai_score: 3,
      calibrated_score: 2.5,
      excerpt: '',
      feedback: 'Нет условия выхода.',
      max_score: 4,
      part_id: 'q1',
      title: 'Опишите цикл',
      criteria: [
        {
          ai_score: 3,
          calibrated_score: 2.5,
          criterion_id: 'c1',
          evidence: [{ quote: 'цикл повторяет тело', verified: true }],
          label: 'Понимание',
          max_score: 4,
          rationale: '',
          unsupported: false,
        },
      ],
    },
  ],
}

const draft = (patch: Partial<GradeDraftView> = {}): GradeDraftView => ({
  activity_id: 'a1',
  agreement: null,
  ai_score: 86,
  calibrated_score: 82.5,
  confidence: 0.8,
  created_at: 10,
  decided_at: null,
  error_code: null,
  final_score: null,
  flags: [],
  id: 'd1',
  is_file: false,
  learner_id: 'u1',
  max_score: 100,
  model_name: 'claude',
  proposal,
  run_id: null,
  status: 'ready',
  subject_id: 's1',
  subject_version: 3,
  ...patch,
})

const form: GradeForm = {
  final_score: '',
  feedback: 'Моё начало.',
  items: [
    { item_id: 'q0', max: 1, score: '1', feedback: '' },
    { item_id: 'q1', max: 4, score: '', feedback: '' },
  ],
}

describe('AI drafts in the queue', () => {
  test('B-GRD-40 one draft per work: the newest of a work wins', () => {
    const old = draft({ id: 'old', created_at: 1, status: 'superseded' })
    const by = draftsBySubject([draft(), old, draft({ id: 'd2', subject_id: 's2' })])
    expect(by.get('s1')?.id).toBe('d1')
    expect(by.get('s2')?.id).toBe('d2')
  })

  test('B-GRD-41 the drafts are read again only while one is being written', () => {
    expect(anyQueued([draft(), draft({ status: 'queued' })])).toBe(true)
    expect(anyQueued([draft()])).toBe(false)
    expect(anyQueued(null)).toBe(false)
  })

  test('B-GRD-42 only the selected works with a ready draft are approved', () => {
    const by = draftsBySubject([draft(), draft({ id: 'd2', subject_id: 's2', status: 'applied' })])
    expect(approvable(['s1', 's2', 's3'], by).map(item => item.id)).toEqual(['d1'])
  })

  test('B-GRD-42 an approval names each draft that did not apply, with its work', () => {
    const outcomes = [
      { draft_id: 'd1', result: 'applied', error: null },
      { draft_id: 'd2', result: 'stale', error: 'precondition-failed' },
    ]
    const failures = approveFailures(outcomes, [draft(), draft({ id: 'd2', subject_id: 's2' })])
    expect(failures).toEqual([{ draft_id: 'd2', result: 'stale', error: 'precondition-failed', subjectId: 's2' }])
  })
})

describe('B-GRD-44 «Перенести в форму»', () => {
  test('B-GRD-44 a question gets its calibrated score on its own scale and the comments go under what is written', () => {
    const next = transferToGradeForm(draft(), form)
    expect(next.items[1]).toEqual({ item_id: 'q1', max: 4, score: '2.5', feedback: 'Нет условия выхода.' })
    expect(next.items[0]).toEqual(form.items[0])
    expect(next.feedback).toBe('Моё начало.\n\nХорошо, но без примера.')
    expect(next.final_score).toBe('')
  })

  test('B-GRD-44 a question whose maximum changed since the draft is rescaled', () => {
    const next = transferToGradeForm(draft(), { ...form, items: [{ item_id: 'q1', max: 2, score: '', feedback: '' }] })
    expect(next.items[0]?.score).toBe('1.25')
  })

  test('B-GRD-44 a draft without the work text carries words, not scores', () => {
    const next = transferToGradeForm(draft({ flags: ['no_text'] }), form)
    expect(next.items[1]?.score).toBe('')
    expect(next.items[1]?.feedback).toBe('Нет условия выхода.')
  })

  test('B-GRD-44 a second transfer does not write the same feedback twice', () => {
    const once = transferToGradeForm(draft(), form)
    expect(transferToGradeForm(draft(), once).feedback).toBe(once.feedback)
  })

  test('B-GRD-44 a file attempt gets rubric points on the rubric scale and the calibrated percentage as its grade', () => {
    const file: FileGradeForm = {
      final_score: '',
      feedback: '',
      criteria: [
        { criterion_id: 'c1', label: 'Понимание', max: 4, score: '' },
        { criterion_id: 'c9', label: 'Оформление', max: 2, score: '1' },
      ],
    }
    const next = transferToFileForm(draft({ is_file: true }), file)
    expect(next.criteria.map(row => row.score)).toEqual(['2.5', '1'])
    expect(next.final_score).toBe('82.5')
    expect(next.feedback).toBe('Хорошо, но без примера.')
  })
})

describe('B-GRD-45 the draft card', () => {
  test('B-GRD-45 only a ready draft is shown', () => {
    expect(isReady(draft())).toBe(true)
    for (const status of ['queued', 'applied', 'discarded', 'superseded', 'failed'])
      expect(isReady(draft({ status }))).toBe(false)
    expect(isReady(undefined)).toBe(false)
  })
})
