import { describe, expect, it } from 'vitest';

import {
  buildExamAntiCheatSettings,
  getExamAttemptLimit,
  getExamTimeLimitSeconds,
  normalizeExamPolicySettings,
} from '@/features/assessments/registry/exam/policySettings';

describe('exam policy settings normalization', () => {
  it('normalizes legacy exam keys into canonical aliases', () => {
    const normalized = normalizeExamPolicySettings({
      attempt_limit: 3,
      time_limit: 45,
      due_date_iso: '2026-05-05T09:00:00Z',
    });

    expect(normalized.max_attempts).toBe(3);
    expect(normalized.attempt_limit).toBe(3);
    expect(normalized.time_limit_seconds).toBe(2700);
    expect(normalized.time_limit).toBe(45);
    expect(normalized.due_at).toBe('2026-05-05T09:00:00Z');
    expect(normalized.due_date_iso).toBe('2026-05-05T09:00:00Z');
  });

  it('prefers canonical exam values when both shapes exist', () => {
    const normalized = normalizeExamPolicySettings({
      max_attempts: 2,
      attempt_limit: 5,
      time_limit_seconds: 1800,
      time_limit: 90,
    });

    expect(getExamAttemptLimit(normalized)).toBe(2);
    expect(getExamTimeLimitSeconds(normalized)).toBe(1800);
    expect(normalized.attempt_limit).toBe(2);
    expect(normalized.time_limit).toBe(30);
  });

  it('builds normalized anti-cheat payloads for the policy patch', () => {
    expect(
      buildExamAntiCheatSettings({
        copy_paste_protection: true,
        tab_switch_detection: false,
        devtools_detection: true,
        right_click_disable: true,
        fullscreen_enforcement: false,
        violation_threshold: 4,
      }),
    ).toEqual({
      copy_paste_protection: true,
      tab_switch_detection: false,
      devtools_detection: true,
      right_click_disable: true,
      fullscreen_enforcement: false,
      violation_threshold: 4,
    });
  });
});
