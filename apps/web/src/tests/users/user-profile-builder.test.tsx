/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import UserProfileBuilder from '@/components/Dashboard/Pages/UserAccount/UserProfile/UserProfileBuilder'
import type { ProfileSections } from '@/lib/api/generated/zod'

const t = (key: string) => key
vi.mock('next-intl', () => ({ useTranslations: () => t, useLocale: () => 'ru-RU' }))
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
const toastError = vi.fn()
const toastSuccess = vi.fn()
vi.mock('sonner', () => ({
  toast: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a) },
}))
const toastApiError = vi.fn()
vi.mock('@/hooks/useApiError', () => ({ useApiError: () => ({ toastApiError, handleApiError: vi.fn() }) }))
vi.mock('@/hooks/useDndAnnouncements', () => ({ useDndAnnouncements: () => ({}) }))
const updateProfile = vi.fn()
vi.mock('@/lib/users/client', () => ({ updateProfile: (...args: unknown[]) => updateProfile(...args) }))

let profile: ProfileSections
vi.mock('@/hooks/useSession', () => ({
  useSession: () => ({ user: { id: 'u1', username: 'builder', profile, theme: null } }),
}))

function renderBuilder() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <UserProfileBuilder />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  profile = {
    sections: [
      {
        id: 'section-1',
        type: 'experience',
        title: 'Опыт',
        experiences: [
          { title: 'Преподаватель', organization: 'ТоУ', startDate: '2024-09-01', current: true, description: '' },
        ],
      },
    ],
  }
})

describe('UserProfileBuilder (BUG-361)', () => {
  it('seeds the sections from the session profile, edits a title and saves the whole document through PATCH /users/me', async () => {
    updateProfile.mockResolvedValueOnce({})
    renderBuilder()
    // The stored section is listed; selecting it opens its editor.
    fireEvent.click(screen.getByText('Опыт'))
    const title = await screen.findByLabelText('Common.sectionTitle')
    fireEvent.change(title, { target: { value: 'Опыт работы' } })
    fireEvent.click(screen.getByRole('button', { name: 'saveButton' }))
    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1))
    expect(updateProfile).toHaveBeenCalledWith({
      profile: { sections: [{ ...profile.sections[0], title: 'Опыт работы' }] },
    })
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('profileUpdateSuccess'))
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('refuses a non-http link before the round trip and selects the offending section', async () => {
    profile = {
      sections: [
        { id: 'section-1', type: 'courses', title: 'Курсы' },
        { id: 'section-2', type: 'links', title: 'Ссылки', links: [{ title: 'x', url: 'javascript:alert(1)' }] },
      ],
    }
    renderBuilder()
    fireEvent.click(screen.getByRole('button', { name: 'saveButton' }))
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Form.invalidUrl'))
    expect(updateProfile).not.toHaveBeenCalled()
    // The links editor of section 2 is open.
    expect(screen.getByDisplayValue('javascript:alert(1)')).toBeTruthy()
  })

  it('routes a server rejection through the localized API error toast', async () => {
    updateProfile.mockRejectedValueOnce(new Error('422'))
    renderBuilder()
    fireEvent.click(screen.getByRole('button', { name: 'saveButton' }))
    await waitFor(() => expect(toastApiError).toHaveBeenCalledTimes(1))
    expect(toastApiError).toHaveBeenCalledWith(expect.any(Error), { fallback: 'profileUpdateError' })
  })
})
