import { describe, expect, test } from 'vite-plus/test'

import type { ScopeCapabilities } from '#/shared/api/gen/types.gen'
import { vAiRunKind, vAiRunStatus, vRemediationStatus } from '#/shared/api/gen/valibot.gen'

import { RUN_KINDS, RUN_STATUSES, runsFilter } from '../route'
import { budgetUsed, gateHolds, panelTabs, pickTab, unavailableReason } from './ai'
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
  })

  test('B-AI-08 error codes read as their texts: API codes, a lost stream, the agents own codes', () => {
    expect(runErrorText('ai-budget-exhausted')).toBe('Лимит токенов ИИ исчерпан. Повторите позже.')
    expect(runErrorText(STREAM_LOST)).toContain('Связь с запуском потеряна')
    expect(runErrorText('AI_RUN_FAILED')).toBe('Запуск ИИ не удался.')
  })
})
