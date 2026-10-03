import * as v from 'valibot'
import { describe, expect, test } from 'vite-plus/test'

import type { Attempt, FileSubmission } from '#/shared/api/gen/types.gen'

import {
  deadlinesForm,
  deadlinesPatch,
  deadlinesSchema,
  filesForm,
  filesPatch,
  filesSchema,
  newCriterion,
  rubricForm,
  rubricPatch,
  rubricSchema,
} from './config'
import {
  attemptNumber,
  attemptsLeft,
  changedFiles,
  lateRule,
  openAttempt,
  pastDue,
  uploadLimits,
  versionHeader,
  withAttempt,
  workOf,
} from './task'
import { describeTypes, tickedGroups, typesOf } from './types'

const file = (id: string) => ({
  id,
  upload_id: `u-${id}`,
  filename: `${id}.pdf`,
  content_type: 'application/pdf',
  position: 0,
  scan_status: 'pending' as const,
  created_at_unix: 1,
  size_bytes: 10,
})

const attempt = (over: Partial<Attempt> = {}): Attempt => ({
  id: 'a1',
  status: 'draft',
  attempt_number: 1,
  files: [],
  is_late: false,
  late_penalty_pct: 0,
  version: 3,
  created_at_unix: 1,
  updated_at_unix: 1,
  allowed_actions: [],
  feedback: null,
  final_score: null,
  graded_at_unix: null,
  raw_score: null,
  rubric_scores: null,
  started_at_unix: null,
  submitted_at_unix: null,
  user: null,
  ...over,
})

const task = (over: Partial<FileSubmission> = {}): FileSubmission => ({
  id: 'f1',
  activity_id: 'act',
  course_id: 'c',
  chapter_id: 'ch',
  title: 'Эссе',
  instructions: 'Напишите эссе.',
  lifecycle: 'published',
  published: true,
  allowed_mime_types: [],
  max_files: 2,
  allow_late: true,
  late_policy: { kind: 'none' },
  grade_release_mode: 'immediate',
  rubric: {},
  settings: {},
  attempts: [],
  disabled_reasons: [],
  created_at_unix: 1,
  updated_at_unix: 1,
  current_attempt: null,
  due_at_unix: null,
  max_attempts: null,
  max_file_size_mb: null,
  published_at_unix: 1,
  ...over,
})

describe('the work area follows the newest attempt', () => {
  test('B-FSB-04 no attempt and a draft are edited; the first write opens the attempt without If-Match', () => {
    expect(workOf(task())).toEqual({ kind: 'edit', attempt: null })
    expect(versionHeader(task())).toEqual({})
    const draft = attempt()
    const open = task({ current_attempt: draft, attempts: [draft] })
    expect(openAttempt(open)).toBe(draft)
    expect(versionHeader(open)).toEqual({ 'If-Match': 3 })
  })

  test('B-FSB-06 B-FSB-07 B-FSB-08 submitted and graded wait, published is done, returned is edited again', () => {
    const of = (status: Attempt['status']) => workOf(task({ current_attempt: attempt({ status }) })).kind
    expect([of('submitted'), of('graded'), of('published'), of('returned')]).toEqual([
      'waiting',
      'waiting',
      'done',
      'edit',
    ])
    expect(openAttempt(task({ current_attempt: attempt({ status: 'published' }) }))).toBeNull()
  })

  test('B-FSB-07 a new attempt is offered until the cap is spent; the confirm names the next number', () => {
    const one = attempt({ status: 'published' })
    expect(attemptsLeft(task({ attempts: [one], max_attempts: null }))).toBe(true)
    expect(attemptsLeft(task({ attempts: [one], max_attempts: 2 }))).toBe(true)
    expect(attemptsLeft(task({ attempts: [one], max_attempts: 1 }))).toBe(false)
    expect(attemptNumber(task({ attempts: [one], current_attempt: one }))).toBe(2)
    expect(attemptNumber(task({ current_attempt: attempt({ attempt_number: 4 }) }))).toBe(4)
  })
})

describe('draft files', () => {
  test('B-FSB-04 adding keeps the attached files with their names; removing drops one by its upload', () => {
    const open = attempt({ files: [file('x'), file('y')] })
    expect(changedFiles(open, { add: { upload_id: 'u-z', display_name: 'z.pdf' } })).toEqual([
      { upload_id: 'u-x', display_name: 'x.pdf' },
      { upload_id: 'u-y', display_name: 'y.pdf' },
      { upload_id: 'u-z', display_name: 'z.pdf' },
    ])
    expect(changedFiles(open, { remove: 'u-x' })).toEqual([{ upload_id: 'u-y', display_name: 'y.pdf' }])
    expect(changedFiles(null, { add: { upload_id: 'u-z' } })).toEqual([{ upload_id: 'u-z' }])
  })

  test('B-FSB-11 an answered attempt replaces its row or comes first, and becomes the current one', () => {
    const old = attempt({ id: 'old', status: 'published' })
    const next = attempt({ id: 'new' })
    const withNew = withAttempt(task({ attempts: [old], current_attempt: old }), next)
    expect(withNew.attempts.map(item => item.id)).toEqual(['new', 'old'])
    expect(withNew.current_attempt).toBe(next)
    const saved = attempt({ id: 'new', version: 4 })
    expect(withAttempt(withNew, saved).attempts).toEqual([saved, old])
  })

  test('B-FSB-04 the task narrows the upload: its types and its size in MB', () => {
    expect(uploadLimits(task({ allowed_mime_types: ['application/pdf'], max_file_size_mb: 5 }))).toEqual({
      mimes: ['application/pdf'],
      maxBytes: 5 * 1024 * 1024,
    })
    expect(uploadLimits(task())).toEqual({ mimes: [], maxBytes: null })
  })
})

describe('the task header', () => {
  test('B-FSB-03 the deadline label and the late rule a learner reads', () => {
    expect(pastDue(task({ due_at_unix: 100 }), 101)).toBe(true)
    expect(pastDue(task({ due_at_unix: 100 }), 100)).toBe(false)
    expect(pastDue(task(), 1e12)).toBe(false)
    expect(lateRule(task())).toBeNull()
    expect(lateRule(task({ due_at_unix: 1, allow_late: false }))).toEqual({ kind: 'closed' })
    expect(lateRule(task({ due_at_unix: 1 }))).toEqual({ kind: 'free' })
    const penalty = { kind: 'penalty' as const, percent_per_day: 10, max_days: 3 }
    expect(lateRule(task({ due_at_unix: 1, late_policy: penalty }))).toEqual({ kind: 'penalty', percent: 10, days: 3 })
    const cutoff = { kind: 'cutoff' as const, cutoff_at_unix: 9 }
    expect(lateRule(task({ due_at_unix: 1, late_policy: cutoff }))).toEqual({ kind: 'cutoff', at: 9 })
  })

  test('B-FSB-03 B-FSB-16 types read as groups; a legacy type outside them stays raw and is kept on save', () => {
    expect(describeTypes(['image/png', 'application/pdf', 'video/mp4'])).toEqual({
      groups: ['pdf', 'images'],
      other: ['video/mp4'],
    })
    expect(describeTypes([])).toEqual({ groups: [], other: [] })
    const ticks = tickedGroups(['application/pdf', 'image/png', 'video/mp4'])
    expect(ticks.pdf).toBe(true)
    expect(ticks.images).toBe(false)
    expect(typesOf({ ...ticks, archives: true }, ['application/pdf', 'video/mp4'])).toEqual([
      'application/pdf',
      'application/zip',
      'application/x-zip-compressed',
      'application/x-rar-compressed',
      'application/vnd.rar',
      'application/x-7z-compressed',
      'application/x-tar',
      'application/gzip',
      'application/x-gzip',
      'video/mp4',
    ])
    expect(typesOf({}, [])).toEqual([])
  })
})

const issuePaths = (value: unknown) => {
  const result = v.safeParse(deadlinesSchema, value)
  return result.success ? [] : result.issues.map(issue => v.getDotPath(issue))
}

describe('studio forms', () => {
  // 2026-02-01 01:30 in Asia/Almaty.
  const DUE = 1_769_891_400

  test('B-FSB-16 file rules: blank size is no limit', () => {
    const form = filesForm(task({ max_files: 3, max_file_size_mb: null, allowed_mime_types: ['application/pdf'] }))
    expect(form).toMatchObject({ max_files: '3', max_file_size_mb: '' })
    expect(form.types.pdf).toBe(true)
    expect(filesPatch({ ...form, max_file_size_mb: ' 20 ' }, task())).toEqual({
      max_files: 3,
      max_file_size_mb: 20,
      allowed_mime_types: ['application/pdf'],
    })
    expect(filesPatch(form, task()).max_file_size_mb).toBeNull()
    expect(v.safeParse(filesSchema, { ...form, max_files: '' }).success).toBe(false)
  })

  test('B-FSB-17 deadline and late rules round-trip through the platform zone; blanks clear', () => {
    const penalty = { kind: 'penalty' as const, percent_per_day: 2.5, max_days: 4 }
    const form = deadlinesForm(task({ due_at_unix: DUE, late_policy: penalty, max_attempts: 2 }))
    expect(form).toMatchObject({ due_at: '2026-02-01T01:30', max_attempts: '2' })
    expect(deadlinesPatch(form)).toEqual({
      due_at_unix: DUE,
      allow_late: true,
      late_policy: penalty,
      max_attempts: 2,
      grade_release_mode: 'immediate',
    })
    const cleared = {
      ...form,
      due_at: '',
      max_attempts: '',
      late_policy: { ...form.late_policy, kind: 'none' as const },
    }
    expect(deadlinesPatch(cleared)).toMatchObject({
      due_at_unix: null,
      max_attempts: null,
      late_policy: { kind: 'none' },
    })
    const comma = { ...form, late_policy: { ...form.late_policy, percent_per_day: '1,5' } }
    expect(deadlinesPatch(comma).late_policy).toEqual({ kind: 'penalty', percent_per_day: 1.5, max_days: 4 })
    const cutoff = {
      ...form,
      late_policy: { ...form.late_policy, kind: 'cutoff' as const, cutoff_at: '2026-02-01T01:30' },
    }
    expect(deadlinesPatch(cutoff).late_policy).toEqual({ kind: 'cutoff', cutoff_at_unix: DUE })
  })

  test('B-FSB-17 the chosen late rule needs its fields; the others are ignored', () => {
    const form = deadlinesForm(task())
    const late = (over: Partial<typeof form.late_policy>) => ({
      ...form,
      late_policy: { ...form.late_policy, ...over },
    })
    expect(issuePaths(form)).toEqual([])
    expect(issuePaths(late({ kind: 'penalty' }))).toEqual(['late_policy.percent_per_day', 'late_policy.max_days'])
    expect(issuePaths(late({ kind: 'cutoff' }))).toEqual(['late_policy.cutoff_at'])
    expect(issuePaths(late({ kind: 'none', percent_per_day: 'x' }))).toEqual([])
  })

  test('B-FSB-15 rubric criteria: names trimmed, points as numbers, old levels kept, none is no rubric', () => {
    const levels = [{ label: 'Отлично', score: 10 }]
    const form = rubricForm({ criteria: [{ criterion_id: 'c1', label: 'Структура', max_score: 10, levels }] })
    expect(form.criteria[0]?.max_score).toBe('10')
    const added = { ...newCriterion(), label: ' Стиль ', max_score: '5' }
    expect(rubricPatch({ criteria: [...form.criteria, added] })).toEqual({
      rubric: {
        criteria: [
          { criterion_id: 'c1', label: 'Структура', max_score: 10, levels },
          { criterion_id: added.criterion_id, label: 'Стиль', max_score: 5 },
        ],
      },
    })
    expect(rubricPatch({ criteria: [] })).toEqual({ rubric: {} })
    expect(rubricForm({})).toEqual({ criteria: [] })
    expect(v.safeParse(rubricSchema, { criteria: [{ ...added, label: ' ' }] }).success).toBe(false)
  })
})
