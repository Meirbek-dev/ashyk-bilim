import * as v from 'valibot'

import { ApiError } from '#/shared/api/errors'
import type {
  AdminUser,
  AdminUserAction,
  GamificationConfig,
  Role,
  RoleAction,
  UpdateGamificationConfigRequest,
  Usergroup,
  UsergroupAction,
  XpSource,
} from '#/shared/api/gen/types.gen'

/** A search box's own form value (a form, so Enter submits; the URL is the source of truth). */
export const searchBoxSchema = v.object({ q: v.string() })

export const canUser = (user: Pick<AdminUser, 'allowed_actions'>, action: AdminUserAction) =>
  user.allowed_actions.includes(action)
export const canRole = (role: Pick<Role, 'allowed_actions'>, action: RoleAction) =>
  role.allowed_actions.includes(action)
export const canGroup = (group: Pick<Usergroup, 'allowed_actions'>, action: UsergroupAction) =>
  group.allowed_actions.includes(action)

/** A 412: the object was saved elsewhere since the form loaded it (`If-Match`, spec 7.6). */
export const isStale = (error: unknown): boolean => error instanceof ApiError && error.status === 412

/** The 409 codes of `POST /users` and `POST /rbac/roles` that name a field: shown under it, not as the form message. */
export function takenField(error: unknown): 'username' | 'email' | 'slug' | null {
  if (!(error instanceof ApiError)) return null
  if (error.code === 'username-taken') return 'username'
  if (error.code === 'email-taken') return 'email'
  if (error.code === 'role-slug-taken') return 'slug'
  return null
}

/**
 * A role's permission strings grouped by their resource (the text before the first `:`), for display only: the
 * strings are shown as the server sends them, the client never interprets them (R-06).
 */
export const permissionsByResource = (permissions: readonly string[]): [string, string[]][] => [
  ...Map.groupBy(permissions, permission => permission.split(':', 1)[0] ?? permission),
]

/** The permissions textarea: one grant per line, blank lines dropped. */
export const permissionLines = (text: string): string[] =>
  text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

/** Every XP source an admin may set a reward for; `admin_award` is the amount typed in each award. */
export const REWARD_SOURCES = [
  'activity_completion',
  'course_completion',
  'quiz_completion',
  'exam_completion',
  'code_challenge_completion',
  'code_challenge_perfect',
  'code_challenge_first_solve',
  'login_bonus',
  'streak_bonus',
] as const satisfies readonly XpSource[]

export type RewardSource = (typeof REWARD_SOURCES)[number]

// UI composition over the generated body schemas (spec 7.8): number fields are typed text, a choice must be made.

/** A pick from a select: the empty placeholder option is not a choice. */
const chosen = v.pipe(v.string(), v.nonEmpty())
export const roleChoiceSchema = v.object({ role: chosen })
export const groupChoiceSchema = v.object({ group: chosen })

/** `vCreateRoleRequest` with the priority as typed text (converted on submit). */
export const roleFormSchema = v.object({
  slug: v.string(),
  display_name: v.string(),
  description: v.string(),
  priority: v.pipe(v.string(), v.trim(), v.regex(/^-?\d+$/)),
})

export const roleEditSchema = v.omit(roleFormSchema, ['slug'])

/** `vAdminAwardRequest` without the user (the panel's) and the key (the action's), amount as typed text. */
export const awardFormSchema = v.object({
  amount: v.pipe(v.string(), v.trim(), v.regex(/^[1-9]\d*$/)),
  reason: v.string(),
})

/** The permissions field: one grant per line (`permissionLines` makes the body). */
export const permissionsFormSchema = v.object({ permissions: v.string() })

/** A whole number or blank (blank = the platform's default). */
const amountText = v.pipe(v.string(), v.trim(), v.regex(/^\d*$/))

/** The rules form: numbers as typed text, so a blank field can mean "default". */
export const rulesFormSchema = v.object({
  daily_xp_limit: amountText,
  rewards: v.record(v.picklist(REWARD_SOURCES), amountText),
})
export type RulesForm = v.InferOutput<typeof rulesFormSchema>

const asText = (value: number | null | undefined) => (value == null ? '' : String(value))

/** The stored overrides as form text; a source without an override is blank. */
export const rulesForm = (config: GamificationConfig): RulesForm => ({
  daily_xp_limit: asText(config.daily_xp_limit),
  rewards: Object.fromEntries(REWARD_SOURCES.map(source => [source, asText(config.rewards[source])])),
})

/**
 * The `PUT` body: it replaces the overrides wholesale, so overrides the form does not show (`admin_award`, a source
 * this web does not know yet) are carried over; a blank field drops its override.
 */
export function rulesBody(form: RulesForm, current: GamificationConfig): UpdateGamificationConfigRequest {
  const rewards = { ...current.rewards }
  for (const source of REWARD_SOURCES) {
    const text = form.rewards[source]
    if (text) rewards[source] = Number(text)
    else delete rewards[source]
  }
  // An absent limit is the platform default (`PUT` replaces the whole config).
  return { daily_xp_limit: form.daily_xp_limit ? Number(form.daily_xp_limit) : undefined, rewards }
}
