import { describe, expect, test } from 'vite-plus/test'

import type { GradeDraftView } from '#/shared/api/gen/types.gen'

import { disagreementGap, driftPoints, labelsFromDrafts } from './consistency'

const draft = (is_file: boolean): GradeDraftView => ({
  activity_id: 'a1',
  agreement: null,
  ai_score: 50,
  calibrated_score: 50,
  confidence: 0.8,
  created_at: 1,
  decided_at: null,
  error_code: null,
  final_score: null,
  flags: [],
  id: is_file ? 'd2' : 'd1',
  is_file,
  learner_id: 'u1',
  max_score: 100,
  model_name: null,
  proposal: {
    auto_max: 0,
    auto_points: 0,
    calibration_corrections: 0,
    confidence: 0.8,
    flags: [],
    overall_feedback: '',
    parts: [
      {
        ai_score: 1,
        calibrated_score: 1,
        excerpt: '',
        feedback: '',
        max_score: 2,
        part_id: is_file ? 'file' : 'q1',
        title: is_file ? 'Работа с файлом' : 'Опишите цикл',
        criteria: [
          {
            ai_score: 1,
            calibrated_score: 1,
            criterion_id: 'c1',
            evidence: [],
            label: 'Условие выхода',
            max_score: 2,
            rationale: '',
            unsupported: false,
          },
        ],
      },
    ],
  },
  run_id: null,
  status: 'ready',
  subject_id: 's1',
  subject_version: 1,
})

describe('B-AIG-09 consistency labels', () => {
  test('B-AIG-09 a question and its criterion read by the titles the drafts carry', () => {
    const labels = labelsFromDrafts([draft(false)])
    expect(labels.part('q1')).toBe('Опишите цикл')
    expect(labels.criterion('q1', 'c1')).toBe('Условие выхода')
  })

  test('B-AIG-09 an unknown key and a file task part have no title', () => {
    const labels = labelsFromDrafts([draft(true)])
    expect(labels.part('file')).toBeNull()
    expect(labels.part('q9')).toBeNull()
    expect(labels.criterion('file', 'c1')).toBe('Условие выхода')
  })
})

describe('B-AIG-07 B-AIG-08 gaps', () => {
  test('B-AIG-07 a teacher grade above the draft is a positive gap', () => {
    expect(
      disagreementGap({
        ai_score: 40,
        final_score: 75,
        draft_id: 'd',
        learner_id: 'u',
        learner_name: 'L',
        subject_id: 's',
      }),
    ).toBe(35)
  })

  test('B-AIG-08 drift offset is shown in percentage points, negative when the AI grades higher', () => {
    expect(driftPoints(-0.1234)).toBe(-12.3)
    expect(driftPoints(0.05)).toBe(5)
  })
})
