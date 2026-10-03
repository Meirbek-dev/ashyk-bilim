import { describe, expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import { ApiError } from '#/shared/api/errors'
import type { Role } from '#/shared/api/gen/types.gen'

import { permissionLines, permissionsByResource, rulesBody, rulesForm, takenField } from './admin'
import { roleDescription, roleName, roleNames } from './roles'

const role = (slug: string, text: Partial<Role> = {}): Role => ({
  slug,
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

  test('B-ADM-09 permissions are grouped by the text before the first colon, strings kept as sent', () => {
    expect(permissionsByResource(['course:read:all', '*:*:*', 'course:update:own', 'quiz:*:platform'])).toEqual([
      ['course', ['course:read:all', 'course:update:own']],
      ['*', ['*:*:*']],
      ['quiz', ['quiz:*:platform']],
    ])
  })

  test('B-ADM-11 the permissions field is one grant per line, blanks dropped', () => {
    expect(permissionLines(' course:read:all \n\n quiz:*:platform\n')).toEqual(['course:read:all', 'quiz:*:platform'])
    expect(permissionLines('')).toEqual([])
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
