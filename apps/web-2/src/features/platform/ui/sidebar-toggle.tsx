import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { IconButton } from '#/shared/ui/icon-button'

/** Collapses the sidebar to icons and back. */
export function SidebarToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <IconButton
      label={collapsed ? m.platform_nav_expand() : m.platform_nav_collapse()}
      icon={collapsed ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
      aria-expanded={!collapsed}
      onClick={onToggle}
    />
  )
}
