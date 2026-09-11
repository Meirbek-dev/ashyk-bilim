/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import UserEditGeneral from '@/components/Dashboard/Pages/UserAccount/UserEditGeneral/UserEditGeneral'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { loading: () => 'toast-1', success: vi.fn(), error: vi.fn(), dismiss: vi.fn() } }))
vi.mock('@/i18n/locale', () => ({ getUserLocale: async () => 'ru-RU' }))
vi.mock('@/hooks/useSession', () => ({
  useSession: () => ({ user: { id: 'u1', username: 'learner', email: 'learner@ashyq.local', display_name: 'Aigerim', bio: '' } }),
}))
vi.mock('@/lib/theme-system', () => ({ ThemeSelector: () => null }))
vi.mock('@/components/theme-mode-toggle', () => ({ ThemeModeToggle: () => null }))
vi.mock('@components/Objects/UserAvatar', () => ({ default: () => null }))
const toastApiError = vi.fn()
vi.mock('@/hooks/useApiError', () => ({ useApiError: () => ({ toastApiError, handleApiError: vi.fn() }) }))
const updateProfile = vi.fn()
vi.mock('@/lib/users/client', () => ({
  updateProfile: (...args: unknown[]) => updateProfile(...args),
  updateUserAvatar: vi.fn(),
}))

beforeEach(() => vi.clearAllMocks())

describe('UserEditGeneral (v2)', () => {
  it('PATCHes only display_name/bio and routes a failure through the localized API error toast with field binding', async () => {
    updateProfile.mockRejectedValueOnce(new Error('boom'))
    render(<UserEditGeneral />)
    const bio = await screen.findByLabelText(/^bio/)
    fireEvent.change(bio, { target: { value: 'new bio' } })
    fireEvent.submit(bio.closest('form')!)
    await waitFor(() => expect(toastApiError).toHaveBeenCalledTimes(1))
    expect(updateProfile).toHaveBeenCalledWith({ display_name: 'Aigerim', bio: 'new bio' })
    expect(toastApiError).toHaveBeenCalledWith(expect.any(Error), {
      setError: expect.any(Function),
      fallback: 'profileUpdateError',
      toastId: 'toast-1',
    })
  })
})
