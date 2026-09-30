/** @vitest-environment jsdom */
// Gauntlet F39: the member picker walked the admin directory (`GET /users`,
// 403 for instructors → "no rows") and showed both link/unlink on every row.
// It now builds rows from the group's members plus `GET /search` people hits
// and offers exactly one membership action per row.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import ManageUsers from '@/components/Objects/Modals/Dash/UserGroups/ManageUsers'

const mocks = vi.hoisted(() => ({
  apiJson: vi.fn(),
  search: vi.fn(),
  link: vi.fn(async () => undefined),
  unlink: vi.fn(async () => undefined),
}))

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/api-client', () => ({ apiJson: mocks.apiJson }))
vi.mock('@/lib/api/generated/search/search', () => ({ search: mocks.search }))
vi.mock('@services/usergroups/usergroups', () => ({
  linkUserToUserGroup: mocks.link,
  unLinkUserToUserGroup: mocks.unlink,
}))
vi.mock('@/hooks/useApiError', () => ({
  useApiError: () => ({ handleApiError: () => ({ message: 'x' }), toastApiError: vi.fn() }),
}))
vi.mock('@/hooks/useDebounce', () => ({ useDebouncedValue: <T,>(value: T) => value }))

const group = '01a08bdf-c95f-75d8-bf08-bb079a77a583'
const member = { id: 'u-member', username: 'alice', display_name: 'Alice' }
const hit = { id: 'u-hit', username: 'learner', display_name: 'Aigerim', avatar_key: null }

beforeEach(() => {
  mocks.apiJson.mockReset().mockResolvedValue([member])
  mocks.search.mockReset().mockResolvedValue({ courses: [], collections: [], users: [hit, member] })
  mocks.link.mockClear()
  mocks.unlink.mockClear()
})

function renderPicker() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ManageUsers usergroup_id={group} />
    </QueryClientProvider>,
  )
}

describe('ManageUsers picker', () => {
  it('lists members without touching the admin directory and searches people on demand', async () => {
    renderPicker()
    expect(await screen.findByText('Alice')).toBeInTheDocument()
    expect(mocks.apiJson.mock.calls.map(call => String(call[0]))).toEqual([`usergroups/${group}/members`])
    expect(mocks.search).not.toHaveBeenCalled()

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'lea' } })
    expect(await screen.findByText('Aigerim')).toBeInTheDocument()
    expect(mocks.search).toHaveBeenCalledWith({ q: 'lea', limit: 50 })
    // A member returned by the search is not listed twice.
    expect(screen.getAllByText('Alice')).toHaveLength(1)
  })

  it('offers one action per row that matches membership', async () => {
    renderPicker()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'lea' } })
    await screen.findByText('Aigerim')
    const rows = screen.getAllByRole('row').slice(1)
    const memberRow = rows.find(row => row.textContent?.includes('Alice'))!
    const hitRow = rows.find(row => row.textContent?.includes('Aigerim'))!
    expect(memberRow.querySelectorAll('button')).toHaveLength(1)
    expect(memberRow.querySelector('button')).toHaveTextContent('unlinkButton')
    expect(hitRow.querySelectorAll('button')).toHaveLength(1)
    expect(hitRow.querySelector('button')).toHaveTextContent('linkButton')

    fireEvent.click(hitRow.querySelector('button')!)
    await waitFor(() => expect(mocks.link).toHaveBeenCalledWith(group, 'u-hit'))
    expect(mocks.unlink).not.toHaveBeenCalled()
  })
})
