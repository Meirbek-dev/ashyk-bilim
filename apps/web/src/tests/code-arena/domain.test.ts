import { describe, expect, it } from 'vite-plus/test'

import type { AssessmentItem } from '@/features/assessments/domain/items'
import type { CodeChallengeSettings, TestCaseResult } from '@/services/courses/code-challenges'
import { codeItemToProblem } from '@/features/code-arena/domain/codeChallenge.mappers'
import {
  caseVerdict,
  firstFailingResult,
  verdictFromResults,
  verdictFromRun,
  verdictLabelKey,
} from '@/features/code-arena/domain/verdicts'
import type { CodeVerdict } from '@/features/code-arena/domain'
import { buildReadiness } from '@/features/code-arena/authoring/PublishReadinessPanel'
import enMessages from '@/messages/en-US.json'
import kkMessages from '@/messages/kk-KZ.json'
import ruMessages from '@/messages/ru-RU.json'

describe('code arena domain', () => {
  it('maps canonical code items into a problem model', () => {
    const item: AssessmentItem = {
      id: '00000000-0000-4000-8000-000000000001',
      item_uuid: 'item_1',
      order: 1,
      kind: 'CODE',
      title: 'Double it',
      max_score: 100,
      created_at: '',
      updated_at: '',
      body: {
        kind: 'CODE',
        prompt: 'Read an integer and print double.',
        input_spec: 'One integer n.',
        output_spec: 'The doubled value.',
        constraints: ['1 <= n <= 100'],
        languages: [71],
        starter_code: { 71: 'n = int(input())' },
        reference_solutions: { 71: 'print(int(input()) * 2)' },
        tests: [],
      },
    }
    const settings = {
      uuid: 'assessment_1',
      difficulty: 'EASY',
      points: 100,
      time_limit: 2,
      memory_limit: 256,
      grading_strategy: 'PARTIAL_CREDIT',
      allowed_languages: [71],
    } satisfies CodeChallengeSettings

    expect(codeItemToProblem({ activityUuid: 'activity_1', item, settings })).toMatchObject({
      activityUuid: 'activity_1',
      itemUuid: 'item_1',
      title: 'Double it',
      prompt: 'Read an integer and print double.',
      inputSpec: 'One integer n.',
      outputSpec: 'The doubled value.',
      constraints: ['1 <= n <= 100'],
      difficulty: 'EASY',
    })
  })

  it('derives verdicts from run status and result rows', () => {
    expect(verdictFromRun('ACCEPTED', 3, 3)).toBe('ACCEPTED')
    expect(verdictFromRun('ACCEPTED', 2, 3)).toBe('WRONG_ANSWER')
    expect(verdictFromRun('COMPILE_ERROR', 0, 1)).toBe('COMPILE_ERROR')

    const results: TestCaseResult[] = [
      {
        test_case_id: 'a',
        status: 3,
        status_description: 'Accepted',
        passed: true,
      },
      {
        test_case_id: 'b',
        status: 4,
        status_description: 'WRONG_ANSWER',
        passed: false,
      },
    ]

    expect(verdictFromResults(results)).toBe('WRONG_ANSWER')
    expect(firstFailingResult(results)?.test_case_id).toBe('b')
  })

  it('matches verdicts on the exact code, never a substring (BUG-373)', () => {
    // 'RUNTIME_ERROR'.includes('TIME') labelled a Python crash «Time Limit».
    expect(verdictFromRun('RUNTIME_ERROR', 0, 1)).toBe('RUNTIME_ERROR')
    expect(verdictFromRun('TIME_LIMIT', 0, 1)).toBe('TIME_LIMIT')
    expect(verdictFromRun('INTERNAL_ERROR', 0, 1)).toBe('INTERNAL_ERROR')
    expect(caseVerdict({ passed: false, status_id: 11 })).toBe('RUNTIME_ERROR')
    expect(caseVerdict({ passed: false, status_id: 5 })).toBe('TIME_LIMIT')
    expect(
      verdictFromResults([
        { test_case_id: 'a', status: 11, status_id: 11, status_description: 'Runtime Error (NZEC)', passed: false },
      ]),
    ).toBe('RUNTIME_ERROR')
  })

  it('labels every verdict, the attempt list and the failing case in all three catalogs (UX-286, UX-287)', () => {
    const verdicts: (CodeVerdict | null)[] = [
      'ACCEPTED',
      'WRONG_ANSWER',
      'COMPILE_ERROR',
      'RUNTIME_ERROR',
      'TIME_LIMIT',
      'INTERNAL_ERROR',
      'DEGRADED',
      'RUNNING',
      'IDLE',
      null,
    ]
    for (const messages of [ruMessages, kkMessages, enMessages]) {
      const catalog = messages.Activities.CodeChallenges as Record<string, unknown>
      const lookup = (key: string) => key.split('.').reduce<unknown>((node, part) => (node as never)?.[part], catalog)
      for (const verdict of verdicts) expect(typeof lookup(verdictLabelKey(verdict))).toBe('string')
      for (const key of ['attemptNumber', 'firstFailingCase', 'caseNumber', 'noProblemStatement']) {
        expect(typeof lookup(key)).toBe('string')
      }
    }
    expect(ruMessages.Activities.CodeChallenges.status.runtimeError).toBe('Ошибка выполнения')
  })

  it('gives Run and Submit different Kazakh labels (UX-289)', () => {
    const kk = kkMessages.Activities.CodeChallenges
    expect(kk.runCodeShort).not.toBe(kk.submitCodeShort)
    expect(kk.runCodeShort).not.toBe(kkMessages.Features.Assessments.Attempt.Exam.submit)
  })

  it('checks the limits the builder edits and names Markdown issues via the catalog (UX-282, UX-285)', () => {
    const t = (key: string) => key
    const settings = {
      uuid: 'a',
      title: 'T',
      prompt: '<b>raw</b>',
      time_limit: 2,
      memory_limit: 256,
      grading_strategy: 'PARTIAL_CREDIT',
      allowed_languages: [],
    } satisfies CodeChallengeSettings
    const item = (s: CodeChallengeSettings, id: string) =>
      buildReadiness(s, t, issue => `field:${issue.field}`).items.find(entry => entry.id === id)

    expect(item(settings, 'limits')?.ok).toBe(true)
    expect(item({ ...settings, time_limit: 0 }, 'limits')?.ok).toBe(false)
    expect(item({ ...settings, memory_limit: 100_000 }, 'limits')?.ok).toBe(false)
    expect(item(settings, 'markdown')).toMatchObject({
      label: 'readiness.markdown.label',
      ok: false,
      detail: 'field:problem',
    })
  })
})
