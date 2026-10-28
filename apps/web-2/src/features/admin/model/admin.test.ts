import * as v from 'valibot'
import { describe, expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import { ApiError } from '#/shared/api/errors'
import type { Role } from '#/shared/api/gen/types.gen'

import {
  refusedGrants,
  refusesGrants,
  awardFormSchema,
  roleFormSchema,
  rulesBody,
  rulesForm,
  platformFormSchema,
  rulesFormSchema,
  takenField,
  userName,
} from './admin'
import { userBadge } from '../ui/labels'
import { usersSearchSchema } from '../route'
import { grantWords, permissionGroups } from './permissions'
import { permissionSummary, roleDescription, roleName, roleNames } from './roles'

const role = (slug: string, text: Partial<Role> = {}): Role => ({
  slug,
  version: 1,
  display_name_key: `roles.${slug}.name`,
  description_key: `roles.${slug}.description`,
  display_name: null,
  description: null,
  priority: 0,
  is_system: true,
  permissions: [],
  allowed_actions: [],
  ...text,
})

const problem = (code: 'username-taken' | 'email-taken' | 'role-slug-taken' | 'conflict') =>
  new ApiError({ status: 409, code, fieldErrors: [], requestId: null, retryAfter: null })

describe('admin model', () => {
  test('B-ADM-08 seeded roles are named from the catalog key, custom ones by their own text, unknown by slug', () => {
    expect(roleName(role('admin'))).toBe(m.admin_role_admin())
    expect(roleDescription(role('instructor'))).toBe(m.admin_role_instructor_hint())
    expect(roleName(role('instructor-legacy-grants', { is_system: false }))).toBe(m.admin_role_instructor_legacy())
    const custom = role('ta', { is_system: false, display_name: 'Ассистент', description: 'Помогает' })
    expect(roleName(custom)).toBe('Ассистент')
    expect(roleDescription(custom)).toBe('Помогает')
    expect(roleName(role('mystery'))).toBe('mystery')
    expect(roleNames(['user', 'gone', 'admin'], [role('admin'), role('user')])).toEqual([
      m.admin_role_admin(),
      m.admin_role_user(),
      'gone',
    ])
  })

  test('B-ADM-08 the wildcard reads «Все права», not «1 право»; other roles count their permissions', () => {
    expect(permissionSummary(['*:*:*'])).toBe(m.admin_role_permissions_all())
    expect(permissionSummary(['course:read:all', 'course:update:own'])).toBe(
      m.admin_role_permission_count({ count: 2 }),
    )
  })

  test('B-ADM-09 grants read in words, grouped by resource in a fixed order; an unknown part stays as sent', () => {
    const groups = permissionGroups(['quiz:*:platform', 'course:update:own', '*:*:*', 'course:read:all', 'robot:fly'])
    expect(groups.map(group => group.resource)).toEqual([
      m.admin_perm_resource_any(),
      m.admin_perm_resource_course(),
      m.admin_perm_resource_quiz(),
      'robot',
    ])
    expect(groups[1]?.grants).toEqual([
      {
        grant: 'course:read:all',
        resource: m.admin_perm_resource_course(),
        action: m.admin_perm_action_read(),
        scope: m.admin_perm_scope_any(),
      },
      {
        grant: 'course:update:own',
        resource: m.admin_perm_resource_course(),
        action: m.admin_perm_action_update(),
        scope: m.admin_perm_scope_own(),
      },
    ])
    // A two-part grant matches every scope, like `*`.
    expect(grantWords('assessment:submit').scope).toBe(m.admin_perm_scope_any())
    expect(grantWords('course:teleport:own').action).toBeNull()
  })

  test('B-ADM-11 a refused grant is named by its row, in the sent order', () => {
    const refused = new ApiError({
      status: 422,
      code: 'validation-failed',
      fieldErrors: [{ field: 'permissions[1]', code: 'invalid', message: 'x' }],
      requestId: null,
      retryAfter: null,
    })
    expect(refusedGrants(refused)).toEqual([1])
    expect(refusesGrants(refused)).toBe(true)
    expect(refusesGrants(problem('conflict'))).toBe(false)
    expect(refusedGrants(problem('conflict'))).toEqual([])
  })

  test('B-ADM-07 a taken username, email or slug belongs under its field; other errors do not', () => {
    expect(takenField(problem('username-taken'))).toBe('username')
    expect(takenField(problem('email-taken'))).toBe('email')
    expect(takenField(problem('role-slug-taken'))).toBe('slug')
    expect(takenField(problem('conflict'))).toBeNull()
    expect(takenField(new Error('network'))).toBeNull()
  })

  test('B-ADM-15 the rules form keeps overrides it does not show and drops cleared ones', () => {
    const current = {
      daily_xp_limit: 300,
      rewards: { course_completion: 250, admin_award: 5, login_bonus: 15 },
      updated_at_unix: 0,
      default_daily_xp_limit: 500,
      default_rewards: {},
    }
    const form = rulesForm(current)
    expect(form.daily_xp_limit).toBe('300')
    expect(form.rewards['course_completion']).toBe('250')
    expect(form.rewards['quiz_completion']).toBe('')
    const body = rulesBody(
      { daily_xp_limit: '', rewards: { ...form.rewards, login_bonus: '', quiz_completion: '40' } },
      current,
    )
    expect(body).toEqual({
      daily_xp_limit: undefined,
      rewards: { course_completion: 250, admin_award: 5, quiz_completion: 40 },
    })
  })
})

test('B-ADM-26 order, status and role live in the URL; an unknown order or status is the default', () => {
  expect(v.parse(usersSearchSchema, { sort: 'name', status: 'disabled', role: 'teacher' })).toMatchObject({
    sort: 'name',
    status: 'disabled',
    role: 'teacher',
  })
  expect(v.parse(usersSearchSchema, { sort: 'oldest', status: 'banned', role: ' ' })).toMatchObject({
    sort: undefined,
    status: undefined,
    role: undefined,
  })
})

describe('XP fields', () => {
  test('B-ADM-15 B-ADM-16 a negative or non-numeric XP says what number is wanted', () => {
    const daily = v.safeParse(rulesFormSchema.entries.daily_xp_limit, '-5')
    expect(daily.success ? null : daily.issues[0]?.message).toBe(m.admin_xp_whole())
    const award = v.safeParse(awardFormSchema, { amount: '0', reason: '' })
    expect(award.success ? null : award.issues[0]?.message).toBe(m.admin_xp_positive())
    const tooMuch = v.safeParse(awardFormSchema, { amount: '150000', reason: '' })
    expect(tooMuch.success ? null : tooMuch.issues[0]?.message).toBe(m.admin_xp_positive())
    expect(v.safeParse(awardFormSchema, { amount: '100000', reason: '' }).success).toBe(true)
  })

  test('an amount past what the server stores is refused here, under its field, not by a bare 422', () => {
    const daily = v.safeParse(rulesFormSchema.entries.daily_xp_limit, '99999999999')
    expect(daily.success ? null : daily.issues[0]?.message).toBe(m.admin_xp_too_large())
    expect(v.safeParse(rulesFormSchema.entries.daily_xp_limit, '2147483647').success).toBe(true)
  })
})

describe('platform form', () => {
  const platform = { name: 'Ashyq Bilim', label: '', description: '', about: '', email: 'support@tou.edu.kz' }
  const fields = (values: object) => {
    const result = v.safeParse(platformFormSchema, { ...platform, ...values })
    return result.success ? [] : [...new Set(result.issues.map(issue => v.getDotPath(issue)))].toSorted()
  }

  test('a blank name and a bad support address are both marked on the first save', () => {
    expect(fields({})).toEqual([])
    expect(fields({ name: '  ', email: 'not-an-email' })).toEqual(['email', 'name'])
    expect(fields({ email: '' })).toEqual(['email'])
  })
})

const failing = (values: Partial<v.InferInput<typeof roleFormSchema>>) => {
  const result = v.safeParse(roleFormSchema, {
    slug: 'teaching-assistant',
    display_name: 'Ассистент',
    description: '',
    priority: '10',
    ...values,
  })
  return result.success ? [] : [...new Set(result.issues.map(issue => issue.path?.[0]?.key))]
}

describe('new role fields', () => {
  test('B-ADM-10 a blank identifier or name and a priority outside 0..99 are caught before the request', () => {
    expect(failing({})).toEqual([])
    expect(failing({ slug: '', display_name: '  ' })).toEqual(['slug', 'display_name'])
    expect(failing({ slug: 'Teaching Assistant' })).toEqual(['slug'])
    expect(failing({ priority: '100' })).toEqual(['priority'])
    expect(failing({ priority: '-1' })).toEqual(['priority'])
  })
})

test('B-ADM-27 an account its owner deleted reads as deleted, not by its placeholder login or as switched off', () => {
  const deleted = { deleted: true, display_name: '', username: 'deleted-01a17998', status: 'disabled' } as const
  expect(userName(deleted)).toBe(m.admin_user_deleted_name())
  expect(userBadge(deleted).label()).toBe(m.admin_status_deleted())
  const off = { ...deleted, deleted: false, username: 'dana' }
  expect(userName(off)).toBe('dana')
  expect(userBadge(off).label()).toBe(m.admin_status_disabled())
})
