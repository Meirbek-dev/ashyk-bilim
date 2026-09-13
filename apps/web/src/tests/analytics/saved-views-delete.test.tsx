/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import SavedViewsBar from '@/components/Dashboard/Analytics/SavedViewsBar'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/hooks/useApiError', () => ({ useApiError: () => ({ toastApiError: vi.fn() }) }))
const deleteAnalyticsView = vi.fn(async () => undefined)
vi.mock('@services/analytics/teacher', () => ({
  getSavedAnalyticsViews: async () => ({ items: [{ id: 'v1', name: 'Мой вид', view_type: 'overview', query: {} }] }),
  saveAnalyticsView: vi.fn(),
  deleteAnalyticsView: (...args: unknown[]) => deleteAnalyticsView(...args),
}))

afterEach(cleanup)

describe('UX-072 saved views bar', () => {
  it('offers a delete control per chip that DELETEs the view and drops the chip', async () => {
    const query = { window: '28d' } as never
    render(<SavedViewsBar query={query} />)
    expect(await screen.findByText('Мой вид')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('savedViewsBar.deleteView'))
    await waitFor(() => expect(deleteAnalyticsView).toHaveBeenCalledWith('v1', query))
    await waitFor(() => expect(screen.queryByText('Мой вид')).toBeNull())
  })
})
