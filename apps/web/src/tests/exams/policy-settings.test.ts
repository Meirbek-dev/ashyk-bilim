import { describe, expect, it } from 'vite-plus/test'

import {
  buildExamPolicyPatch,
  getExamAttemptLimit,
  getExamTimeLimitSeconds,
} from '@/features/assessments/registry/exam/policySettings'

describe('exam policy patch builder', () => {
  it('reads canonical exam values before create-dialog field names', () => {
    const settings = {
      max_attempts: 2,
      attempt_limit: 5,
      time_limit_seconds: 1800,
      time_limit: 90,
    }

    expect(getExamAttemptLimit(settings)).toBe(2)
    expect(getExamTimeLimitSeconds(settings)).toBe(1800)
  })

  it('builds one canonical policy patch', () => {
    expect(
      buildExamPolicyPatch({
        attempt_limit: 3,
        time_limit: 45,
        copy_paste_protection: true,
        tab_switch_detection: false,
        devtools_detection: true,
        right_click_disable: true,
        fullscreen_enforcement: false,
        violation_threshold: 4,
      }),
    ).toEqual({
      max_attempts: 3,
      time_limit_seconds: 2700,
      copy_paste_protection: true,
      tab_switch_detection: false,
      devtools_detection: true,
      right_click_disabled: true,
      fullscreen_required: false,
      violation_threshold: 4,
    })
  })
})
