import { describe, expect, test } from 'vite-plus/test'

import type { ScopeCapabilities } from '#/shared/api/gen/types.gen'
import { vAiRunKind, vAiRunStatus, vRemediationStatus } from '#/shared/api/gen/valibot.gen'

import { RUN_KINDS, RUN_STATUSES, runsFilter } from '../route'
import {
  budgetUsed,
  gateHolds,
  panelTabs,
  pickTab,
  unavailableReason,
  citedActivity,
  feedbackDraft,
  readableExcerpt,
} from './ai'
import { runErrorText } from './labels'
import { STREAM_LOST } from './run'

const caps = (patch: Partial<ScopeCapabilities> = {}): ScopeCapabilities => ({
  available: true,
  context: null,
  context_visibility: 'student',
  features: [],
  modes: ['ask', 'explain', 'practice'],
  reason: null,
  restricted: false,
  role: 'student',
  surface: 'student-activity',
  ...patch,
})

describe('panel tabs', () => {
  test('B-AI-03 a learner gets questions and study; remediation only with sessions of this activity', () => {
    expect(panelTabs(caps(), false)).toEqual(['chat', 'study'])
    expect(panelTabs(caps(), true)).toEqual(['chat', 'study', 'remediation'])
    expect(panelTabs(caps({ surface: 'course-page' }), true)).toEqual(['chat', 'study'])
  })

  test('B-AI-03 a teacher in the studio gets questions and the lecture critique when its feature is on', () => {
    const studio = caps({ role: 'teacher', surface: 'teacher-studio', modes: ['ask'] })
    expect(panelTabs(studio, false)).toEqual(['chat'])
    const on = { ...studio, features: [{ key: 'lecture_authoring_enabled', enabled: true, reason: null }] }
    expect(panelTabs(on, false)).toEqual(['chat', 'critique'])
  })

  test('B-AI-03 the URL tab wins when offered, else the first one', () => {
    expect(pickTab(['chat', 'study'], 'study')).toBe('study')
    expect(pickTab(['chat'], 'remediation')).toBe('chat')
    expect(pickTab([], 'chat')).toBeUndefined()
  })

  test('B-AI-02 an unavailable scope has no tabs and a reason', () => {
    const off = caps({ available: false, reason: 'ai_disabled', modes: [] })
    expect(panelTabs(off, true)).toEqual([])
    expect(unavailableReason(off)).toBe('ai_disabled')
    expect(unavailableReason(caps({ available: false, reason: 'restricted_activity' }))).toBe('restricted_activity')
    expect(unavailableReason(caps({ available: false, reason: 'no_enabled_modes' }))).toBe('other')
  })
})

describe('remediation and admin helpers', () => {
  test('B-AI-17 a gate holds until it is passed', () => {
    expect(vRemediationStatus.options.map(status => [status, gateHolds(status)])).toEqual([
      ['assigned', true],
      ['in_progress', true],
      ['passed', false],
      ['failed', true],
    ])
  })

  test('B-AI-20 the budget share used, clamped', () => {
    expect(budgetUsed(1000, 250)).toBe(75)
    expect(budgetUsed(0, 0)).toBe(0)
    expect(budgetUsed(100, -50)).toBe(100)
  })

  test('B-AI-21 unset filters are left out of the runs query; its enums match the contract', () => {
    expect(RUN_STATUSES).toEqual(vAiRunStatus.options)
    expect(RUN_KINDS).toEqual(vAiRunKind.options)
    expect(runsFilter({ days: 7 })).toEqual({ days: 7 })
    expect(runsFilter({ days: 1, status: 'failed', kind: 'course_qa' })).toEqual({
      days: 1,
      status: 'failed',
      kind: 'course_qa',
    })
    const course = '0190a5d2-0000-7000-8000-0000000000d1'
    expect(runsFilter({ days: 7, provider: 'openrouter', course })).toEqual({
      days: 7,
      provider: 'openrouter',
      course_id: course,
    })
  })

  test('B-AI-08 error codes read as their texts: API codes, a lost stream, the agents own codes', () => {
    expect(runErrorText('ai-budget-exhausted')).toBe('Лимит токенов ИИ исчерпан. Повторите позже.')
    expect(runErrorText(STREAM_LOST)).toContain('Связь с запуском потеряна')
    expect(runErrorText('AI_RUN_FAILED')).toBe('Запуск ИИ не удался.')
  })
})

test('B-AI-31 a citation keeps a quote and drops an excerpt in machine form', () => {
  expect(readableExcerpt('  «Welcome to the course.» ')).toBe('«Welcome to the course.»')
  expect(readableExcerpt('{"due_at":null,"grading_mode":"auto"}')).toBe('')
  expect(readableExcerpt('"prompt":"Print n squared."')).toBe('')
  expect(readableExcerpt('Пустые ограничения: "constraints": []')).toBe('')
  // Settings quoted as snake_case pairs (an exam's limits, a document's file) are machine form too.
  expect(readableExcerpt('max_attempts: 1, time_limit_seconds: 3600, passing_score: 60.0')).toBe('')
  expect(readableExcerpt('file_name: e2e-document.pdf')).toBe('')
  expect(readableExcerpt('Сохраните файл как report_2024.pdf: так проще.')).toBe(
    'Сохраните файл как report_2024.pdf: так проще.',
  )
  expect(readableExcerpt(null)).toBe('')
})

test('B-AI-27 a cited activity is found by source_uuid or by its activity:<id> citation id; other sources are not', () => {
  const id = '0190a5d2-0000-7000-8000-0000000000a1'
  expect(citedActivity({ source_type: 'activity', source_uuid: id, citation_id: 'x' })).toBe(id)
  expect(citedActivity({ source_type: 'activity', citation_id: `activity:${id}` })).toBe(id)
  expect(citedActivity({ source_type: 'course', source_uuid: id, citation_id: 'course' })).toBeNull()
  expect(citedActivity({ source_type: 'activity', citation_id: 'activity:../x' })).toBeNull()
})

test('B-AI-29 the feedback draft is the summary, each gap with what to work on, then the next step', () => {
  expect(
    feedbackDraft({
      summary: 'Ошибки в циклах.',
      knowledge_gaps: [
        { concept: 'Условие выхода', remediation_goal: 'Повторить while' },
        { concept: 'Счётчик', evidence: 'i не растёт' },
      ],
      next_action: 'Решить задачу 2 заново',
    }),
  ).toBe(
    'Ошибки в циклах.\n\n- **Условие выхода**: Повторить while\n- **Счётчик**: i не растёт\n\nРешить задачу 2 заново',
  )
  expect(feedbackDraft({ summary: 'Хорошо.' })).toBe('Хорошо.')
})
