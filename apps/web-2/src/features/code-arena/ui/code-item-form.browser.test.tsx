import { QueryClientProvider } from '@tanstack/react-query'
import { Suspense } from 'react'
import { expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import { createQueryClient } from '#/shared/api/query-client'
import type { AssessmentDetail, AssessmentItem, CodeBody } from '#/shared/api/gen/types.gen'
import { renderInRouter } from '#/shared/components/testing'

import { runnerStateOptions } from '../queries'
import { CodeItemForm } from './code-item-form'

const body: CodeBody & { kind: 'code' } = {
  kind: 'code',
  prompt: 'Sum two numbers',
  input_spec: 'a b',
  output_spec: 'a + b',
  constraints: [],
  languages: [71],
  starter_code: {},
  reference_solutions: {},
  tests: [{ id: 't1', input: '1 2', expected_output: '3', is_visible: true, weight: 1, description: null }],
  time_limit_seconds: 5,
  memory_limit_mb: 256,
  max_output_kb: null,
}

const item: AssessmentItem = {
  assessment_version: 3,
  body,
  id: '0190a5d2-0000-7000-8000-0000000000c2',
  kind: 'code',
  max_score: 10,
  metadata: { difficulty: null, estimated_minutes: null, section_label: null },
  position: 1,
  title: 'Sum',
}

const challenge: AssessmentDetail = {
  access_mode: 'all_course_learners',
  activity_id: '0190a5d2-0000-7000-8000-0000000000c3',
  allowed_actions: ['update', 'edit_wording'],
  allowed_transitions: [],
  archived_at_unix: null,
  content_version: 2,
  course_id: '0190a5d2-0000-7000-8000-0000000000c4',
  created_at_unix: 1_760_000_000,
  creator_id: null,
  description: '',
  edit_lock: 'has_submissions',
  grading_type: 'numeric',
  id: '0190a5d2-0000-7000-8000-0000000000c1',
  kind: 'code_challenge',
  lifecycle: 'published',
  policy_version: 1,
  published_at_unix: 1_760_000_000,
  scheduled_at_unix: null,
  title: 'Sum',
  updated_at_unix: 1_760_000_000,
  version: 3,
  weight: 1,
  items: [item],
  policy: {
    allow_late: true,
    attempt_penalty_percent: 0,
    completion_rule: 'passed',
    copy_paste_protection: false,
    devtools_detection: false,
    due_at_unix: null,
    fullscreen_required: false,
    grace_period_minutes: 0,
    grade_release_mode: 'immediate',
    grading_mode: 'auto',
    late_policy: { kind: 'none' },
    max_attempts: null,
    negative_marking_percent: 0,
    partial_credit: true,
    passing_score: 60,
    randomize_options: false,
    randomize_questions: false,
    required: false,
    review_visibility: 'score_only',
    right_click_disabled: false,
    tab_switch_detection: false,
    time_limit_seconds: null,
    violation_threshold: 3,
  },
}

test('B-COD-27 a solved live challenge keeps its statement editable and Save, its limits locked, no reference check', async () => {
  const queryClient = createQueryClient(async () => undefined)
  queryClient.setQueryDefaults(runnerStateOptions().queryKey, { staleTime: Infinity })
  queryClient.setQueryData(runnerStateOptions().queryKey, { state: 'off' })
  const screen = await renderInRouter(
    <QueryClientProvider client={queryClient}>
      <Suspense>
        <CodeItemForm activityId={challenge.activity_id} challenge={challenge} code={{ item, body }} />
      </Suspense>
    </QueryClientProvider>,
  )
  await expect.element(screen.getByRole('textbox', { name: m.code_field_input_spec() })).toBeEnabled()
  await expect.element(screen.getByRole('textbox', { name: m.code_field_time() })).toBeDisabled()
  // The blank-means-default hint stands under the limits heading for both fields, not under the narrow time field.
  await expect.element(screen.getByText(m.code_limits_hint())).toBeVisible()
  await expect
    .element(screen.getByRole('textbox', { name: m.code_field_time() }))
    .not.toHaveAccessibleDescription(m.code_limits_hint())
  await expect.element(screen.getByRole('button', { name: m.ui_save() })).toBeInTheDocument()
  await expect.element(screen.getByRole('button', { name: m.code_check() })).not.toBeInTheDocument()
  await expect.element(screen.getByText(m.code_lock_has_submissions())).toBeVisible()
})
