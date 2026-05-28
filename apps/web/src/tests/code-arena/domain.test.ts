import { describe, expect, it } from 'vitest'

import type { AssessmentItem } from '@/features/assessments/domain/items'
import type { CodeChallengeSettings, TestCaseResult } from '@/services/courses/code-challenges'
import { codeItemToProblem } from '@/features/code-arena/domain/codeChallenge.mappers'
import {
  firstFailingResult,
  verdictFromResults,
  verdictFromRun,
  verdictLabel,
} from '@/features/code-arena/domain/verdicts'

describe('code arena domain', () => {
  it('maps canonical code items into a problem model', () => {
    const item: AssessmentItem = {
      id: 1,
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
    expect(verdictLabel('TIME_LIMIT')).toBe('Time Limit')

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
})
