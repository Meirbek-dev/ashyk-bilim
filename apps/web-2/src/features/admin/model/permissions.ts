import { m } from '#/paraglide/messages'

// The server's grant grammar `resource:action[:scope]` (apps/server crates/core/src/permission.rs), worded for a
// reader. The contract carries the grants as plain strings; a part this table does not know stays as sent, so a value
// the server adds later still shows (and is never dropped by the editor).
const RESOURCES = {
  '*': m.admin_perm_resource_any,
  platform: m.admin_perm_resource_platform,
  course: m.admin_perm_resource_course,
  chapter: m.admin_perm_resource_chapter,
  activity: m.admin_perm_resource_activity,
  quiz: m.admin_perm_resource_quiz,
  exam: m.admin_perm_resource_exam,
  assessment: m.admin_perm_resource_assessment,
  trail: m.admin_perm_resource_trail,
  certificate: m.admin_perm_resource_certificate,
  collection: m.admin_perm_resource_collection,
  discussion: m.admin_perm_resource_discussion,
  file: m.admin_perm_resource_file,
  analytics: m.admin_perm_resource_analytics,
  user: m.admin_perm_resource_user,
  usergroup: m.admin_perm_resource_usergroup,
  role: m.admin_perm_resource_role,
  api_token: m.admin_perm_resource_api_token,
} satisfies Record<string, () => string>

const ACTIONS = {
  '*': m.admin_perm_action_any,
  read: m.admin_perm_action_read,
  create: m.admin_perm_action_create,
  update: m.admin_perm_action_update,
  delete: m.admin_perm_action_delete,
  manage: m.admin_perm_action_manage,
  author: m.admin_perm_action_author,
  publish: m.admin_perm_action_publish,
  enroll: m.admin_perm_action_enroll,
  submit: m.admin_perm_action_submit,
  grade: m.admin_perm_action_grade,
  moderate: m.admin_perm_action_moderate,
  export: m.admin_perm_action_export,
} satisfies Record<string, () => string>

// A grant without a scope and one with `*` match the same requests (`Grant::grants`): both read «без ограничений».
const SCOPES = {
  '*': m.admin_perm_scope_any,
  all: m.admin_perm_scope_any,
  platform: m.admin_perm_scope_platform,
  assigned: m.admin_perm_scope_assigned,
  own: m.admin_perm_scope_own,
} satisfies Record<string, () => string>

type Catalog = Record<string, () => string>

const word = (catalog: Catalog, part: string): string | null => (Object.hasOwn(catalog, part) ? catalog[part]!() : null)

export type GrantWords = {
  /** The grant as the server sends it. */
  grant: string
  /** The resource's name, or the part as sent when the table does not know it. */
  resource: string
  /** «Просмотр», «Изменение»…; null when the action is unknown (the reader then sees the grant as sent). */
  action: string | null
  /** «Только свои», «На всей платформе»…; null for an unknown scope. */
  scope: string | null
}

export function grantWords(grant: string): GrantWords {
  const [resource = grant, action = '', scope = '*'] = grant.split(':')
  return {
    grant,
    resource: word(RESOURCES, resource) ?? resource,
    action: word(ACTIONS, action),
    scope: word(SCOPES, scope),
  }
}

/** The order the list shows resources in: the table's own (platform first), unknown ones after, as sent. */
const resourceRank = (resource: string) => {
  const at = Object.keys(RESOURCES).indexOf(resource)
  return at === -1 ? Number.MAX_SAFE_INTEGER : at
}
const actionRank = (action: string) => {
  const at = Object.keys(ACTIONS).indexOf(action)
  return at === -1 ? Number.MAX_SAFE_INTEGER : at
}

/** A role's grants grouped by resource, worded, in a fixed order (resource, then action), for the read-only list. */
export function permissionGroups(permissions: readonly string[]): { resource: string; grants: GrantWords[] }[] {
  const sorted = permissions.toSorted((a, b) => {
    const [ra = '', aa = ''] = a.split(':')
    const [rb = '', ab = ''] = b.split(':')
    return resourceRank(ra) - resourceRank(rb) || actionRank(aa) - actionRank(ab) || a.localeCompare(b)
  })
  return [...Map.groupBy(sorted, grant => grant.split(':', 1)[0] ?? grant)].map(([resource, grants]) => ({
    resource: word(RESOURCES, resource) ?? resource,
    grants: grants.map(grantWords),
  }))
}

/** The pickers of the grant editor: every part the server parses, worded. */
export const resourceChoices = () => Object.entries(RESOURCES).map(([value, label]) => ({ value, label: label() }))
export const actionChoices = () => Object.entries(ACTIONS).map(([value, label]) => ({ value, label: label() }))
export const scopeChoices = () =>
  (['*', 'platform', 'assigned', 'own'] as const).map(value => ({ value, label: SCOPES[value]() }))
