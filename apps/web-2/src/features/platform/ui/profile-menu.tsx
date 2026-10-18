import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import * as v from 'valibot'

import { useLogout } from '#/features/auth'
import { updateProfileOptions } from '#/features/settings'
import { m } from '#/paraglide/messages'
import { getLocale, locales, setLocale } from '#/paraglide/runtime'
import type { SessionInfo } from '#/shared/api/gen/types.gen'
import type { WorkspaceId } from '#/shared/auth/access'
import { AccountMenu } from '#/shared/components/account-menu'
import { IconButton } from '#/shared/components/icon-button'
import { localeChoice } from '#/shared/components/locale-switch'
import { useModeChoice } from '#/shared/components/mode-switch'
import { UserAvatar, userInitials } from '#/shared/components/user-avatar'
import { cookieItem } from '#/shared/lib/storage'

import { useWorkspaceChoice } from './workspace-switch'

// Set by the edge while both webs run on this origin (docs/INFRA.md "Dual web"); /ui/classic is the edge's too.
const dualWeb = cookieItem('ab_dual', v.literal('1'))

/**
 * The profile menu: the public profile, settings, the way back to the old web while both run, appearance, language, the
 * workspace (phones) and sign out.
 */
export function ProfileMenu({ session, current }: { session: SessionInfo; current: WorkspaceId }) {
  const navigate = useNavigate()
  const logout = useLogout()
  const mode = useModeChoice()
  const workspace = useWorkspaceChoice(session, current)
  const update = useMutation(updateProfileOptions(useQueryClient()))
  // A signed-in user's language lives in the profile (the server renders their pages in it): save, then reload in it.
  const language = {
    ...localeChoice(),
    onValueChange: (value: string) => {
      const locale = locales.find(entry => entry === value)
      if (locale && locale !== getLocale())
        update.mutate({ body: { locale } }, { onSuccess: () => void setLocale(locale) })
    },
  }
  return (
    <AccountMenu
      trigger={
        <IconButton
          label={`${m.platform_profile_menu()}: ${userInitials(session.user.display_name)}`}
          icon={<UserAvatar name={session.user.display_name} avatarKey={session.user.avatar_key} />}
        />
      }
      title={session.user.display_name}
      detail={`@${session.user.username}`}
      choice={workspace}
      actions={[
        {
          label: m.platform_my_profile(),
          onSelect: () => void navigate({ to: '/users/$username', params: { username: session.user.username } }),
        },
        { label: m.platform_page_settings(), onSelect: () => void navigate({ to: '/settings' }) },
        ...(dualWeb.get()
          ? [
              {
                label: m.platform_classic_ui(),
                onSelect: () => void navigate({ href: '/ui/classic', reloadDocument: true }),
              },
            ]
          : []),
      ]}
      submenus={[mode, language]}
      final={{ label: m.auth_logout(), onSelect: logout }}
    />
  )
}
