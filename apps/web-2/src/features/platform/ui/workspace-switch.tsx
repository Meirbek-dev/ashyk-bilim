import { useNavigate } from '@tanstack/react-router'
import { ChevronsUpDown } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { SessionInfo } from '#/shared/api/gen/types.gen'
import { availableWorkspaces, workspaceHome, type WorkspaceId } from '#/shared/auth/access'
import { Button } from '#/shared/ui/button'
import type { MenuChoice } from '#/shared/ui/choice-items'
import { ChoiceMenu } from '#/shared/ui/choice-menu'

/** Learn / Teach / Admin as a menu choice, or null when the user has only one workspace (spec 5.1). */
export function useWorkspaceChoice(session: SessionInfo, current: WorkspaceId): MenuChoice | null {
  const navigate = useNavigate()
  const available = availableWorkspaces(session)
  if (available.length < 2) return null
  return {
    label: m.platform_workspace_label(),
    value: current,
    options: available.map(workspace => ({ value: workspace.id, label: workspace.label() })),
    onValueChange: value => {
      const target = available.find(workspace => workspace.id === value)
      if (target) void navigate({ to: workspaceHome(session, target.id) })
    },
  }
}

/** The top-bar switch (desktop); on phones the same choice sits in the profile menu (DESIGN 6). */
export function WorkspaceSwitch({ session, current }: { session: SessionInfo; current: WorkspaceId }) {
  const choice = useWorkspaceChoice(session, current)
  if (!choice) return null
  const label = choice.options.find(option => option.value === current)?.label ?? ''
  return (
    <ChoiceMenu
      choice={choice}
      trigger={
        <Button variant="ghost" aria-label={`${choice.label}: ${label}`}>
          {label}
          <ChevronsUpDown aria-hidden />
        </Button>
      }
    />
  )
}
