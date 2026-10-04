import { useNavigate } from '@tanstack/react-router'

import { useLogout } from '#/features/auth'
import { m } from '#/paraglide/messages'
import type { SessionInfo } from '#/shared/api/gen/types.gen'
import type { WorkspaceId } from '#/shared/auth/access'
import { AccountMenu } from '#/shared/components/account-menu'
import { IconButton } from '#/shared/components/icon-button'
import { localeChoice } from '#/shared/components/locale-switch'
import { useModeChoice } from '#/shared/components/mode-switch'
import { UserAvatar } from '#/shared/components/user-avatar'

import { useWorkspaceChoice } from './workspace-switch'

/** The profile menu: settings, appearance, language, the workspace (phones) and sign out. */
export function ProfileMenu({ session, current }: { session: SessionInfo; current: WorkspaceId }) {
  const navigate = useNavigate()
  const logout = useLogout()
  const mode = useModeChoice()
  const workspace = useWorkspaceChoice(session, current)
  return (
    <AccountMenu
      trigger={<IconButton label={m.platform_profile_menu()} icon={<UserAvatar name={session.user.display_name} />} />}
      title={session.user.display_name}
      detail={session.user.username}
      choice={workspace}
      actions={[{ label: m.platform_page_settings(), onSelect: () => void navigate({ to: '/settings' }) }]}
      submenus={[mode, localeChoice()]}
      final={{ label: m.auth_logout(), onSelect: logout }}
    />
  )
}
