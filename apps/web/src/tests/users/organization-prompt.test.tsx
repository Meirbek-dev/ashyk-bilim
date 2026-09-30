/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import OrganizationPrompt from '@/components/Dashboard/OrganizationPrompt'

const t = (key: string) => key
vi.mock('next-intl', () => ({ useTranslations: () => t }))
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('@/hooks/useApiError', () => ({ useApiError: () => ({ handleApiError: () => ({ message: 'failed' }) }) }))
const updateProfile = vi.fn()
vi.mock('@/lib/users/client', () => ({ updateProfile: (...args: unknown[]) => updateProfile(...args) }))

beforeEach(() => vi.clearAllMocks())

describe('OrganizationPrompt', () => {
  it('refuses a blank organization, saves a trimmed one and refreshes the dashboard', async () => {
    updateProfile.mockResolvedValueOnce({})
    render(<OrganizationPrompt />)
    const input = await screen.findByLabelText('organization')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.submit(input.closest('form')!)
    await waitFor(() => expect(screen.getByText('required')).toBeTruthy())
    expect(updateProfile).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: '  КазНУ ' } })
    fireEvent.submit(input.closest('form')!)
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    expect(updateProfile).toHaveBeenCalledWith({ organization: 'КазНУ' })
  })
})
