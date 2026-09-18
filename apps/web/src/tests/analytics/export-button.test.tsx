/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import AnalyticsExportButton from '@/components/Dashboard/Analytics/AnalyticsExportButton'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => 'kk' }))
const toastSuccess = vi.fn()
vi.mock('sonner', () => ({ toast: { success: (...args: unknown[]) => toastSuccess(...args), error: vi.fn() } }))
const toastApiError = vi.fn()
vi.mock('@/hooks/useApiError', () => ({ useApiError: () => ({ toastApiError }) }))
let grants = new Set<string>()
vi.mock('@/hooks/useSession', () => ({
  useSession: () => ({ can: (r: string, a: string, s: string) => grants.has(`${r}:${a}:${s}`) }),
}))
const downloadAnalyticsExport = vi.fn(async (..._args: unknown[]) => ({ blob: new Blob(['x']), filename: 'a.csv' }))
vi.mock('@services/analytics/teacher', () => ({
  downloadAnalyticsExport: (...args: unknown[]) => downloadAnalyticsExport(...args),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('UX-114 analytics export button', () => {
  it('is hidden without analytics:export', () => {
    grants = new Set(['analytics:read:assigned'])
    render(<AnalyticsExportButton href="/x.csv" label="Export" />)
    expect(screen.queryByText('Export')).toBeNull()
  })

  it('downloads in the UI locale and toasts on success', async () => {
    grants = new Set(['analytics:export:assigned'])
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:x')
    globalThis.URL.revokeObjectURL = vi.fn()
    render(<AnalyticsExportButton href="/x.csv" label="Export" />)
    fireEvent.click(screen.getByText('Export'))
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('exportSaved'))
    expect(downloadAnalyticsExport).toHaveBeenCalledWith('/x.csv', 'kk')
  })
})
