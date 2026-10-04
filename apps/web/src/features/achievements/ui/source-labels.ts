import { m } from '#/paraglide/messages'
import type { XpSource } from '#/shared/api/gen/types.gen'

/** What an XP award was for: exhaustive over the contract's sources. */
export const sourceLabel: Record<XpSource, () => string> = {
  activity_completion: m.achievements_source_activity_completion,
  course_completion: m.achievements_source_course_completion,
  login_bonus: m.achievements_source_login_bonus,
  quiz_completion: m.achievements_source_quiz_completion,
  exam_completion: m.achievements_source_exam_completion,
  streak_bonus: m.achievements_source_streak_bonus,
  admin_award: m.achievements_source_admin_award,
  code_challenge_completion: m.achievements_source_code_challenge_completion,
  code_challenge_perfect: m.achievements_source_code_challenge_perfect,
  code_challenge_first_solve: m.achievements_source_code_challenge_first_solve,
}
