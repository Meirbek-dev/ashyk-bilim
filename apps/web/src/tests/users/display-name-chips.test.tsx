/** @vitest-environment jsdom */
// Gauntlet: after renaming, the header chip and the dash sidebar still showed
// the username ("Learner" / "@learner") instead of `display_name`.
import { describe, expect, it, vi } from 'vite-plus/test'
import { render, screen } from '@testing-library/react'
import { HeaderProfileBox } from '@/components/Security/HeaderProfileBox'

const user = { id: 'u1', username: 'learner', email: 'learner@ashyq.local', display_name: 'Aigerim Critic', bio: '' }

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/hooks/useSession', () => ({
  useSession: () => ({ isAuthenticated: true, user, session: { user, roles: ['user'], permissions: [] } }),
}))
vi.mock('@/hooks/useNavigationPermissions', () => ({ useNavigationPermissions: () => ({ canAccessDashboard: true }) }))
vi.mock('@/lib/auth/use-logout', () => ({ useLogout: () => ({ logout: vi.fn(), isLoggingOut: false }) }))
vi.mock('@components/Objects/UserAvatar', () => ({ default: () => null }))

describe('HeaderProfileBox', () => {
  it('shows display_name in the chip, not the username', () => {
    render(<HeaderProfileBox />)
    expect(screen.getByText('Aigerim Critic')).toBeInTheDocument()
    expect(screen.queryByText('learner')).toBeNull()
  })
})
