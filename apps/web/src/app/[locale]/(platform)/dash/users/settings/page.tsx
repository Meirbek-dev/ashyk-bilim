import { requireSession } from '@/lib/auth/session'
import { sessionCan } from '@/lib/auth/permissions'
import { Actions, Resources, Scopes } from '@/types/permissions'
import { redirect } from '@/i18n/navigation'
import { getLocale } from 'next-intl/server'

// Land on the first tab the caller may open: the admin directory needs
// `platform:read:platform`; instructors only hold the usergroup grants.
export default async function UsersSettingsPage() {
  const [session, locale] = await Promise.all([requireSession(), getLocale()])
  const canSeeDirectory =
    sessionCan(session, Resources.APP, Actions.READ, Scopes.APP) ||
    sessionCan(session, Resources.USER, Actions.UPDATE, Scopes.APP)
  redirect({ href: canSeeDirectory ? '/dash/users/settings/users' : '/dash/users/settings/usergroups', locale })
}
