/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { cleanup, render, screen } from '@testing-library/react'
import { SidebarProvider } from '@/components/ui/sidebar'
import DashSidebar from '@/components/Dashboard/Menus/DashSidebar'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('next/image', () => ({ default: () => null }))
vi.mock('@/i18n/navigation', () => ({ usePathname: () => '/dash', Link: () => null, useRouter: () => ({}) }))
vi.mock('@/components/ui/AppLink', () => ({
  default: ({ children }: { children?: React.ReactNode }) => <a>{children}</a>,
}))
vi.mock('@/components/providers/theme-provider', () => ({ useTheme: () => ({ isDark: false, toggleMode: vi.fn() }) }))
vi.mock('@/lib/auth/use-logout', () => ({ useLogout: () => ({ logout: vi.fn(), isLoggingOut: false }) }))
vi.mock('@/hooks/useNavigationPermissions', () => ({
  useNavigationPermissions: () => ({
    canSeeCourses: false,
    canSeeAnalytics: false,
    canSeeUsers: false,
    canSeeAdmin: false,
  }),
}))
vi.mock('@/hooks/useSession', () => ({
  useSession: () => ({ user: { id: 'u1', username: 'aigerim', display_name: 'Aigerim' } }),
}))
vi.mock('@components/Objects/UserAvatar', () => ({ default: () => null }))
vi.mock('@/components/Utils/LocaleSwitcher', () => ({ LocaleSwitcher: () => <select aria-label="locale-switcher" /> }))

afterEach(cleanup)

describe('UX-074 dash sidebar', () => {
  it('renders the public LocaleSwitcher in the sidebar footer', () => {
    render(
      <SidebarProvider defaultOpen>
        <DashSidebar />
      </SidebarProvider>,
    )
    expect(screen.getByLabelText('locale-switcher')).toBeTruthy()
  })
})
