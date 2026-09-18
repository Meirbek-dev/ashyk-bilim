import { describe, expect, it } from 'vite-plus/test'

import { itemBodyToWire, itemFromWire } from '@/features/assessments/domain/assessment-wire'
import { buildAssessmentPatch, studioDetailFromWire, toAssessmentEditorState } from '@/features/assessments/studio/utils'
import type { AssessmentDetail } from '@/lib/api/generated/zod'
import type { AssessmentEditorState } from '@/features/assessments/studio/studioTypes'

const ASM_ID = '22222222-2222-4222-8222-222222222222'
const ACTIVITY_ID = '66666666-6666-4666-8666-666666666666'
const COURSE_ID = '44444444-4444-4444-8444-444444444444'
const ITEM_ID = '55555555-5555-4555-8555-555555555555'

function wireAssessment(overrides: Partial<AssessmentDetail> = {}): AssessmentDetail {
  return {
    id: ASM_ID,
    activity_id: ACTIVITY_ID,
    course_id: COURSE_ID,
    kind: 'exam',
    title: 'Midterm',
    description: 'Covers ch. 1-5',
    lifecycle: 'published',
    weight: 1,
    grading_type: 'percentage',
    content_version: 1,
    policy_version: 1,
    access_mode: 'course',
    created_at_unix: 0,
    updated_at_unix: 0,
    policy: {
      grading_mode: 'auto',
      grade_release_mode: 'immediate',
      completion_rule: 'submit',
      passing_score: 60,
      allow_late: false,
      late_policy: { kind: 'none' },
      required: true,
      review_visibility: 'full',
      randomize_questions: false,
      randomize_options: false,
      partial_credit: true,
      negative_marking_percent: 0,
      grace_period_minutes: 5,
      copy_paste_protection: true,
      tab_switch_detection: false,
      devtools_detection: false,
      right_click_disabled: false,
      fullscreen_required: false,
      violation_threshold: 3,
      attempt_penalty_percent: 0,
      max_attempts: 2,
      time_limit_seconds: 1800,
      due_at_unix: 1_800_000_000,
    },
    items: [
      {
        id: ITEM_ID,
        position: 1,
        kind: 'choice',
        title: 'Q1',
        max_score: 1,
        metadata: { tags: [], outcome_ids: [] },
        body: {
          kind: 'choice',
          prompt: 'Pick one',
          options: [{ id: 'opt_a', text: 'A', is_correct: true }],
          multiple: false,
          variant: 'single_choice',
        },
      },
    ],
    ...overrides,
  } as AssessmentDetail
}

describe('studioDetailFromWire', () => {
  it('maps the v2 AssessmentDetail (GET activities/{id}/assessment) onto the studio shape', () => {
    const detail = studioDetailFromWire(wireAssessment())

    expect(detail.assessment_uuid).toBe(ASM_ID)
    expect(detail.activity_uuid).toBe(ACTIVITY_ID)
    expect(detail.course_uuid).toBe(COURSE_ID)
    expect(detail.kind).toBe('EXAM')
    expect(detail.lifecycle).toBe('PUBLISHED')
    expect(detail.grading_type).toBe('PERCENTAGE')
    expect(detail.items).toHaveLength(1)
    expect(detail.items[0]?.item_uuid).toBe(ITEM_ID)
    expect(detail.assessment_policy?.canonical_policy?.passing_score).toBe(60)
    expect(detail.assessment_policy?.canonical_policy?.max_attempts).toBe(2)
    expect(detail.assessment_policy?.canonical_policy?.review_visibility).toBe('FULL')
    // raw_policy is kept so a settings save can PUT a full replacement without
    // dropping fields the editor UI doesn't expose (grading_mode, late_policy, …).
    expect(detail.raw_policy.grading_mode).toBe('auto')
  })
})

describe('buildAssessmentPatch', () => {
  it('carries forward unexposed policy fields and only edits what the editor state changed', () => {
    const assessment = studioDetailFromWire(wireAssessment())
    const state: AssessmentEditorState = {
      title: 'Midterm (updated)',
      description: 'Covers ch. 1-6',
      dueAt: '',
      gradingType: 'PERCENTAGE',
      maxAttempts: '3',
      timeLimitMinutes: '45',
      copyPasteProtection: true,
      tabSwitchDetection: false,
      devtoolsDetection: false,
      rightClickDisable: false,
      fullscreenEnforcement: false,
      violationThreshold: '3',
      allowResultReview: true,
      showCorrectAnswers: true,
      passThreshold: '70',
      randomizeQuestions: false,
      randomizeOptions: false,
      partialCredit: true,
      gracePeriodMinutes: '',
      availableFrom: '',
      negativeMarkingPercent: '',
    }

    const { details, policy } = buildAssessmentPatch('exam', assessment, state)

    expect(details).toEqual({ title: 'Midterm (updated)', description: 'Covers ch. 1-6' })
    // Edited field:
    expect(policy?.passing_score).toBe(70)
    // Not exposed by the editor — carried forward from raw_policy, not dropped:
    expect(policy?.grading_mode).toBe('auto')
    expect(policy?.late_policy).toEqual({ kind: 'none' })
    expect(policy?.allow_late).toBe(false)
  })

  // BUG-170: `max_attempts: null` (unlimited) stays unlimited — the editor
  // state is an empty field, and a description-only edit sends no policy.
  it('keeps an unlimited quiz unlimited and sends no policy for a description-only edit', () => {
    const assessment = studioDetailFromWire(
      wireAssessment({ policy: { ...wireAssessment().policy, max_attempts: null, time_limit_seconds: null } }),
    )
    const state = toAssessmentEditorState(assessment)
    expect(state.maxAttempts).toBe('')

    const { details, policy } = buildAssessmentPatch('exam', assessment, { ...state, description: 'Covers ch. 1-6' })
    expect(details.description).toBe('Covers ch. 1-6')
    expect(policy).toBeNull()

    expect(buildAssessmentPatch('exam', assessment, { ...state, maxAttempts: '3' }).policy?.max_attempts).toBe(3)
  })
})

describe('itemBodyToWire / itemFromWire', () => {
  it('round-trips a CHOICE item body through the wire and back', () => {
    const wireBody = wireAssessment().items[0]!.body
    const domainItem = itemFromWire(wireAssessment().items[0]!)

    expect(domainItem.body.kind).toBe('CHOICE')
    const wireAgain = itemBodyToWire(domainItem.body)
    expect(wireAgain).toEqual({ ...wireBody, explanation: null })
  })
})
