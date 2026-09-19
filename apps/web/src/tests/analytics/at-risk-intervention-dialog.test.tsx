/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AtRiskLearnersTable from '@/components/Dashboard/Analytics/AtRiskLearnersTable'
import { APIError } from '@/lib/api/assertSuccess'

// Stable like the real hooks (memoized per locale) — the memo test depends on it.
const t = (key: string) => key
const formatter = { number: (v: number) => String(v).replace('.', ',') }
vi.mock('next-intl', () => ({ useTranslations: () => t, useLocale: () => 'ru', useFormatter: () => formatter }))
vi.mock('@/i18n/navigation', () => ({ Link: () => null, useRouter: () => ({ refresh: vi.fn() }) }))
const toastError = vi.fn()
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: (...args: unknown[]) => toastError(...args) } }))
const toastApiError = vi.fn()
const handleApiError = vi.fn(() => ({ message: 'codes.forbidden' }))
vi.mock('@/hooks/useApiError', () => ({ useApiError: () => ({ toastApiError, handleApiError }) }))
const createTeacherIntervention = vi.fn()
const getTeacherInterventions = vi.fn(async (..._args: unknown[]) => ({ items: [] }))
vi.mock('@services/analytics/teacher', () => ({
  getTeacherInterventions: (...args: unknown[]) => getTeacherInterventions(...args),
  createTeacherIntervention: (...args: unknown[]) => createTeacherIntervention(...args),
}))

const row = {
  user_id: 'u1',
  user_display_name: 'Aigerim',
  course_id: 'c1',
  course_name: 'Rust',
  progress_pct: 62.5,
  days_since_last_activity: 9,
  risk_score: 71,
  risk_level: 'high',
  reason_codes: ['inactive_7d'],
  recommended_action: 'contact_learner_this_week',
  open_grading_blocks: 0,
  intervention_count: 0,
}

function renderTable(rows: unknown[]) {
  const client = new QueryClient()
  const query = { window: '28d' } as never
  const ui = (r: unknown[]) => (
    <QueryClientProvider client={client}>
      <AtRiskLearnersTable rows={r as never} query={query} />
    </QueryClientProvider>
  )
  const result = render(ui(rows))
  return { ...result, rerenderWith: (r: unknown[]) => result.rerender(ui(r)) }
}

afterEach(cleanup)

describe('UX-114 at-risk table', () => {
  it('keeps the intervention trigger mounted across a refresh and formats percentages via Intl', () => {
    const { rerenderWith } = renderTable([row])
    expect(screen.getByText('62,5%')).toBeTruthy()
    const trigger = screen.getByText('intervention.manage')
    // A refreshed server payload is a new rows/query object; the cell (and the
    // dialog trigger the closed dialog returns focus to) must not remount.
    rerenderWith([{ ...row, intervention_count: 1 }])
    expect(screen.getByText('intervention.manage')).toBe(trigger)
  })

  it('names the un-enrolled learner on a 422 user_id/not-in-course', async () => {
    createTeacherIntervention.mockRejectedValueOnce(
      new APIError({
        status: 422,
        code: 'validation-failed',
        message: 'Validation failed',
        fieldErrors: [{ field: 'user_id', code: 'not-in-course', message: 'not enrolled' }],
      }),
    )
    renderTable([row])
    fireEvent.click(screen.getByText('intervention.manage'))
    fireEvent.click(await screen.findByText('atRisk.interventions.message'))
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('atRisk.learnerNotEnrolled'))
    expect(toastApiError).not.toHaveBeenCalled()
  })

  it('shows the journal load error through the API error mapper (UX-122)', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    getTeacherInterventions.mockRejectedValueOnce(
      new APIError({ status: 403, code: 'forbidden', message: 'missing permission analytics:read' }),
    )
    render(
      <QueryClientProvider client={client}>
        <AtRiskLearnersTable rows={[row] as never} query={{ window: '28d' } as never} />
      </QueryClientProvider>,
    )
    fireEvent.click(screen.getByText('intervention.manage'))
    expect(await screen.findByText('codes.forbidden')).toBeTruthy()
    expect(screen.queryByText(/missing permission/)).toBeNull()
    expect(handleApiError).toHaveBeenCalled()
  })
})
