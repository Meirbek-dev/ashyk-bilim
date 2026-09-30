/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import UserProfileBuilder from '@/components/Dashboard/Pages/UserAccount/UserProfile/UserProfileBuilder'
import type { ProfileSections } from '@/lib/api/generated/zod'
import { APIError } from '@/lib/api/assertSuccess'

const t = Object.assign(
  (key: string, values?: Record<string, string>) => (values ? `${key} ${JSON.stringify(values)}` : key),
  {
    has: (key: string) => key === 'fields.too-long',
  },
)
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
const saveProfileDocument = vi.fn()
vi.mock('@/lib/users/client', () => ({
  saveProfileDocument: (...args: unknown[]) => saveProfileDocument(...args),
}))

let profile: ProfileSections

function renderBuilder() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <UserProfileBuilder initialProfile={profile} initialVersion={4} />
    </QueryClientProvider>,
  )
}

const SAVE_TOAST = { id: 'profile-builder-save' }

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
  it('seeds the sections from the loaded profile, edits a title and saves the whole document at its version', async () => {
    saveProfileDocument.mockResolvedValueOnce(5).mockResolvedValueOnce(6)
    renderBuilder()
    // The stored section is listed; selecting it opens its editor.
    fireEvent.click(screen.getByText('Опыт'))
    const title = await screen.findByLabelText('Common.sectionTitle')
    fireEvent.change(title, { target: { value: 'Опыт работы' } })
    fireEvent.click(screen.getByRole('button', { name: 'saveButton' }))
    await waitFor(() => expect(saveProfileDocument).toHaveBeenCalledTimes(1))
    expect(saveProfileDocument).toHaveBeenCalledWith(
      { sections: [{ ...profile.sections[0], title: 'Опыт работы' }] },
      4,
    )
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('profileUpdateSuccess', SAVE_TOAST))
    expect(refresh).toHaveBeenCalledTimes(1)
    // BUG-367: the next save carries the version the last one returned.
    fireEvent.click(screen.getByRole('button', { name: 'saveButton' }))
    await waitFor(() => expect(saveProfileDocument).toHaveBeenCalledTimes(2))
    expect(saveProfileDocument.mock.calls[1]![1]).toBe(5)
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
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Form.invalidUrl', SAVE_TOAST))
    expect(saveProfileDocument).not.toHaveBeenCalled()
    // The links editor of section 2 is open.
    expect(screen.getByDisplayValue('javascript:alert(1)')).toBeTruthy()
  })

  it('routes a server rejection without a section path through the localized API error toast', async () => {
    saveProfileDocument.mockRejectedValueOnce(new Error('500'))
    renderBuilder()
    fireEvent.click(screen.getByRole('button', { name: 'saveButton' }))
    await waitFor(() => expect(toastApiError).toHaveBeenCalledTimes(1))
    expect(toastApiError).toHaveBeenCalledWith(expect.any(Error), {
      fallback: 'profileUpdateError',
      toastId: SAVE_TOAST.id,
    })
  })

  it('opens the section a server-only rule rejected and names it in the toast (UX-269)', async () => {
    profile = {
      sections: [
        { id: 'section-1', type: 'courses', title: 'Курсы' },
        { id: 'section-2', type: 'links', title: 'Ссылки', links: [{ title: 'x', url: 'https:///x' }] },
      ],
    }
    saveProfileDocument.mockRejectedValueOnce(
      new APIError({
        status: 422,
        code: 'validation-failed',
        message: 'Validation failed',
        fieldErrors: [
          { field: 'profile.sections[1].links[0].url', code: 'invalid', message: 'must be an http(s) URL' },
        ],
      }),
    )
    renderBuilder()
    fireEvent.click(screen.getByRole('button', { name: 'saveButton' }))
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        `Errors.sectionField ${JSON.stringify({ section: 'Ссылки', message: 'Form.invalidUrl' })}`,
        SAVE_TOAST,
      ),
    )
    expect(toastApiError).not.toHaveBeenCalled()
    expect(screen.getByDisplayValue('https:///x')).toBeTruthy()
  })

  it('reports a save from a stale tab instead of overwriting (BUG-367)', async () => {
    saveProfileDocument.mockRejectedValueOnce(
      new APIError({ status: 412, code: 'precondition-failed', message: 'Precondition failed' }),
    )
    renderBuilder()
    fireEvent.click(screen.getByRole('button', { name: 'saveButton' }))
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('profileStaleError', SAVE_TOAST))
    expect(toastApiError).not.toHaveBeenCalled()
  })
})
