/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import UserEditGeneral from '@/components/Dashboard/Pages/UserAccount/UserEditGeneral/UserEditGeneral'

const t = (key: string) => key
vi.mock('next-intl', () => ({ useTranslations: () => t }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { loading: () => 'toast-1', success: vi.fn(), error: vi.fn(), dismiss: vi.fn() } }))
vi.mock('@/i18n/locale', () => ({ getUserLocale: async () => 'ru-RU' }))
// Stable mocks: a fresh `t`/`user`/`handleApiError` per render re-runs the profile effect (`form.reset`) mid-submit.
const me = {
  id: 'u1',
  username: 'learner',
  email: 'learner@ashyq.local',
  display_name: 'Aigerim',
  bio: '',
  avatar_key: 'avatars/u1.webp',
}
vi.mock('@/hooks/useSession', () => ({ useSession: () => ({ user: me }) }))
vi.mock('@/lib/theme-system', () => ({ ThemeSelector: () => null }))
vi.mock('@/components/theme-mode-toggle', () => ({ ThemeModeToggle: () => null }))
vi.mock('@components/Objects/UserAvatar', () => ({ default: () => null }))
const toastApiError = vi.fn()
const handleApiError = vi.fn()
vi.mock('@/hooks/useApiError', () => ({ useApiError: () => ({ toastApiError, handleApiError }) }))
const updateProfile = vi.fn()
const removeUserAvatar = vi.fn()
vi.mock('@/lib/users/client', () => ({
  updateProfile: (...args: unknown[]) => updateProfile(...args),
  updateUserAvatar: vi.fn(),
  removeUserAvatar: () => removeUserAvatar(),
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

describe('UX-070 blank display name', () => {
  it('rejects a whitespace-only display name inline and never PATCHes', async () => {
    render(<UserEditGeneral />)
    const name = await screen.findByLabelText(/^displayName/)
    fireEvent.change(name, { target: { value: '   ' } })
    fireEvent.submit(name.closest('form')!)
    await waitFor(() => expect(screen.getByText('Form.requiredField')).toBeTruthy())
    expect(updateProfile).not.toHaveBeenCalled()
  })
})

describe('UX-163 remove avatar', () => {
  it('clears the avatar through the API and hides the control', async () => {
    removeUserAvatar.mockResolvedValueOnce({})
    render(<UserEditGeneral />)
    fireEvent.click(await screen.findByRole('button', { name: 'removeAvatar' }))
    await waitFor(() => expect(screen.getByText('avatarRemoved')).toBeTruthy())
    expect(removeUserAvatar).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'removeAvatar' })).toBeNull()
  })
})
