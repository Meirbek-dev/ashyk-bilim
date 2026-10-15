import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

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
import { UserAvatar } from '#/shared/components/user-avatar'

import { useWorkspaceChoice } from './workspace-switch'

/** The profile menu: the public profile, settings, appearance, language, the workspace (phones) and sign out. */
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
          label={m.platform_profile_menu()}
          icon={<UserAvatar name={session.user.display_name} avatarKey={session.user.avatar_key} />}
        />
      }
      title={session.user.display_name}
      detail={session.user.username}
      choice={workspace}
      actions={[
        {
          label: m.platform_my_profile(),
          onSelect: () => void navigate({ to: '/users/$username', params: { username: session.user.username } }),
        },
        { label: m.platform_page_settings(), onSelect: () => void navigate({ to: '/settings' }) },
      ]}
      submenus={[mode, language]}
      final={{ label: m.auth_logout(), onSelect: logout }}
    />
  )
}
