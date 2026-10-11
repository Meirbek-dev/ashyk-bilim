/** @vitest-environment jsdom */
// A double click on «Создать группу» created two identical groups: the second click landed on the dialog's form
// while it was closing after the first success.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'

const createUserGroup = vi.fn(async () => ({ data: {} }))
vi.mock('@services/usergroups/usergroups', () => ({ createUserGroup: () => createUserGroup() }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('sonner', () => ({ toast: { loading: vi.fn(), success: vi.fn(), error: vi.fn() } }))
vi.mock('@/hooks/useApiError', () => ({ useApiError: () => ({ toastApiError: vi.fn() }) }))

import AddUserGroup from '@components/Objects/Modals/Dash/UserGroups/AddUserGroup'

describe('AddUserGroup', () => {
  it('creates the group once on a double submit', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AddUserGroup setCreateUserGroupModal={() => {}} />
      </QueryClientProvider>,
    )
    fireEvent.change(screen.getByLabelText('nameLabel'), { target: { value: 'ИС-21' } })
    fireEvent.click(screen.getByRole('button', { name: 'createButton' }))
    await waitFor(() => expect(createUserGroup).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: /createButton|loadingButton/ }))
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(createUserGroup).toHaveBeenCalledTimes(1)
  })
})
