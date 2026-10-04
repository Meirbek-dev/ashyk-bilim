import { m } from '#/paraglide/messages'
import type { Role } from '#/shared/api/gen/types.gen'

// Seeded roles carry i18n keys (`display_name_key`, `description_key`) and no text: the web's catalog owns their
// names (migration 20260816000003). Custom roles carry their own `display_name` / `description`, except the ETL's
// `<slug>-legacy-grants` roles (BUG-378, UX-314), which keep catalog keys too.
const seededTexts = {
  'roles.admin.name': m.admin_role_admin,
  'roles.admin.description': m.admin_role_admin_hint,
  'roles.maintainer.name': m.admin_role_maintainer,
  'roles.maintainer.description': m.admin_role_maintainer_hint,
  'roles.instructor.name': m.admin_role_instructor,
  'roles.instructor.description': m.admin_role_instructor_hint,
  'roles.moderator.name': m.admin_role_moderator,
  'roles.moderator.description': m.admin_role_moderator_hint,
  'roles.user.name': m.admin_role_user,
  'roles.user.description': m.admin_role_user_hint,
  'roles.guest.name': m.admin_role_guest,
  'roles.guest.description': m.admin_role_guest_hint,
  'roles.maintainer-legacy-grants.name': m.admin_role_maintainer_legacy,
  'roles.instructor-legacy-grants.name': m.admin_role_instructor_legacy,
  'roles.moderator-legacy-grants.name': m.admin_role_moderator_legacy,
  'roles.user-legacy-grants.name': m.admin_role_user_legacy,
  'roles.guest-legacy-grants.name': m.admin_role_guest_legacy,
  'roles.maintainer-legacy-grants.description': m.admin_role_legacy_hint,
  'roles.instructor-legacy-grants.description': m.admin_role_legacy_hint,
  'roles.moderator-legacy-grants.description': m.admin_role_legacy_hint,
  'roles.user-legacy-grants.description': m.admin_role_legacy_hint,
  'roles.guest-legacy-grants.description': m.admin_role_legacy_hint,
} satisfies Record<string, () => string>

type SeededRoleKey = keyof typeof seededTexts

const isSeededKey = (key: string): key is SeededRoleKey => key in seededTexts

const seeded = (key: string): string | null => (isSeededKey(key) ? seededTexts[key]() : null)

type RoleText = Pick<Role, 'slug' | 'display_name' | 'display_name_key' | 'description' | 'description_key'>

/** A custom role's own name, a seeded role's catalog name, or (an unknown key) its slug. */
export const roleName = (role: RoleText): string => role.display_name || seeded(role.display_name_key) || role.slug

export const roleDescription = (role: RoleText): string => role.description || seeded(role.description_key) || ''

/** A user's role slugs as names, in the server's role order; a slug the list does not have stays as it is. */
export const roleNames = (slugs: readonly string[], roles: readonly Role[]): string[] => [
  ...roles.filter(role => slugs.includes(role.slug)).map(roleName),
  ...slugs.filter(slug => !roles.some(role => role.slug === slug)),
]
