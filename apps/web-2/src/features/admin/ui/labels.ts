import { m } from '#/paraglide/messages'

import type { UserStatus } from '#/shared/api/gen/types.gen'

import type { RewardSource } from '../model/admin'

// Exhaustive maps (spec 7.9, DESIGN 8): a new value without a text is a type error here.

export const userStatusBadges = {
  active: { label: m.admin_status_active, tone: 'neutral' },
  disabled: { label: m.admin_status_disabled, tone: 'destructive' },
} as const satisfies Record<UserStatus, { label: () => string; tone: 'neutral' | 'destructive' }>

export const roleKindLabels = {
  system: m.admin_role_kind_system,
  custom: m.admin_role_kind_custom,
} satisfies Record<'system' | 'custom', () => string>

export const rewardLabels = {
  activity_completion: m.admin_xp_activity_completion,
  course_completion: m.admin_xp_course_completion,
  quiz_completion: m.admin_xp_quiz_completion,
  exam_completion: m.admin_xp_exam_completion,
  code_challenge_completion: m.admin_xp_code_challenge_completion,
  code_challenge_perfect: m.admin_xp_code_challenge_perfect,
  code_challenge_first_solve: m.admin_xp_code_challenge_first_solve,
  login_bonus: m.admin_xp_login_bonus,
  streak_bonus: m.admin_xp_streak_bonus,
} satisfies Record<RewardSource, () => string>
