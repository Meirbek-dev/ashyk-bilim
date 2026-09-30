/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import SavedViewsBar, { savedViewHref } from '@/components/Dashboard/Analytics/SavedViewsBar'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/hooks/useApiError', () => ({ useApiError: () => ({ toastApiError: vi.fn() }) }))
const deleteAnalyticsView = vi.fn(async (..._args: unknown[]) => undefined)
const saveAnalyticsView = vi.fn(async (body: { name: string; view_type: string; query: object }) => ({
  id: 'v2',
  ...body,
}))
vi.mock('@services/analytics/teacher', () => ({
  getSavedAnalyticsViews: async () => ({
    items: [{ id: 'v1', name: 'Мой вид', view_type: 'watchlist', query: { window: '7d', sort_by: 'name' } }],
  }),
  saveAnalyticsView: (...args: unknown[]) => saveAnalyticsView(...(args as [never])),
  deleteAnalyticsView: (...args: unknown[]) => deleteAnalyticsView(...args),
}))

afterEach(cleanup)

describe('UX-072 saved views bar', () => {
  it('offers a delete control per chip that DELETEs the view and drops the chip', async () => {
    const query = { window: '28d' } as never
    render(<SavedViewsBar query={query} viewType="overview" />)
    expect(await screen.findByText('Мой вид')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('savedViewsBar.deleteView'))
    await waitFor(() => expect(deleteAnalyticsView).toHaveBeenCalledWith('v1', query))
    await waitFor(() => expect(screen.queryByText('Мой вид')).toBeNull())
  })

  // UX-106: the view remembers its page and sort; the chip restores both.
  it('saves view_type from the current page and the chip restores that page with sort_by', async () => {
    const query = { window: '7d', sort_by: 'name', sort_order: 'asc' } as never
    render(<SavedViewsBar query={query} viewType="watchlist" />)
    fireEvent.click(await screen.findByText('Мой вид'))
    expect(push).toHaveBeenCalledWith('/dash/analytics/watchlist?window=7d&sort_by=name')
    fireEvent.change(screen.getByPlaceholderText('savedViewsBar.namePlaceholder'), { target: { value: 'Риск' } })
    fireEvent.click(screen.getByText('savedViewsBar.save'))
    await waitFor(() => expect(saveAnalyticsView).toHaveBeenCalled())
    expect(saveAnalyticsView.mock.calls[0]?.[0]).toMatchObject({ name: 'Риск', view_type: 'watchlist', query })
    expect(savedViewHref({ view_type: 'legacy', query: {} })).toBe('/dash/analytics/overview')
  })
})
