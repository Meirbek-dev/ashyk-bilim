/** @vitest-environment jsdom */
// BUG-158: a teacher assigns a gate (or the last attempt is spent) while the
// learner sits on the result page. The retry then 403s with a `DisabledReason`
// in `detail` — the page refetches attempt-state so the gate card shows,
// instead of toasting «У вас нет прав…».
// UX-097: a pending hand-in with attempts left keeps the bottom bar neutral
// («Ожидание оценки»); the retake is the entry card's secondary control.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import InlineAssessmentWorkspace from '@/features/assessments/shell/InlineAssessmentWorkspace'
import { disabledReasonOf } from '@/features/assessments/domain/disabled-reason'
import { DEFAULT_POLICY_VIEW } from '@/features/assessments/domain/policy'
import type { AttemptViewModel } from '@/features/assessments/domain/view-models'
import { APIError } from '@/lib/api/assertSuccess'
import { queryKeys } from '@/lib/react-query/queryKeys'

const mocks = vi.hoisted(() => ({
  vm: null as unknown,
  apiJson: vi.fn(),
  toastApiError: vi.fn(),
  setBottomBarAction: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ number: (n: number) => String(n), dateTime: () => '' }),
  useLocale: () => 'ru',
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('@components/ui/AppLink', () => ({ default: (props: React.ComponentProps<'a'>) => <a {...props} /> }))
vi.mock('@/lib/api-client', () => ({ apiJson: mocks.apiJson }))
vi.mock('@/hooks/useSession', () => ({ useSession: () => ({ user: { id: 'u1' }, can: () => false }) }))
vi.mock('@/hooks/useContributorStatus', () => ({ useContributorStatus: () => ({ contributorStatus: null }) }))
vi.mock('@/hooks/useApiError', () => ({
  useApiError: () => ({
    toastApiError: mocks.toastApiError,
    handleApiError: () => ({ message: '', showRetry: false }),
  }),
}))
vi.mock('@/features/assessments/hooks/useAssessment', () => ({
  useAssessmentAttempt: () => ({
    vm: { surface: 'ATTEMPT', kind: 'TYPE_CUSTOM', vm: mocks.vm },
    isLoading: false,
    error: null,
  }),
}))
vi.mock('@/features/assessments/shell/ActivityLayoutContext', () => ({
  useActivityLayout: () => ({
    mode: 'CONTENT',
    setMode: vi.fn(),
    bottomBarAction: null,
    setBottomBarAction: mocks.setBottomBarAction,
  }),
}))
vi.mock('@/features/learner-course/api', () => ({
  learnerCourseStateQueryOptions: () => ({ queryKey: ['learner-state'], queryFn: async () => null, enabled: false }),
}))

const base = {
  kind: 'TYPE_CUSTOM',
  assessmentUuid: 'asm-1',
  activityUuid: 'a1',
  title: 'Квиз',
  description: null,
  policy: DEFAULT_POLICY_VIEW,
  items: [{ id: 'i1', item_uuid: 'i1', order: 0, kind: 'CHOICE', title: 'Q', max_score: 1 }],
  itemScores: {},
  disabledActionReasons: [],
  isReturnedForRevision: false,
  canStartRevision: false,
  score: { percent: 40, source: 'final' },
  startedAt: null,
  releaseState: 'VISIBLE',
  submissionStatus: 'SUBMITTED',
} as unknown as AttemptViewModel

function renderWorkspace() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  render(
    <QueryClientProvider client={client}>
      <InlineAssessmentWorkspace activityUuid="a1" courseUuid="c1" />
    </QueryClientProvider>,
  )
  return { invalidate }
}

const gate403 = () =>
  new APIError({
    code: 'forbidden',
    status: 403,
    message: 'cannot start: REMEDIATION_REQUIRED',
    envelope: {
      type: 'about:blank',
      title: 'Forbidden',
      status: 403,
      code: 'forbidden',
      detail: 'cannot start: REMEDIATION_REQUIRED',
      details: null,
      field_errors: [],
      request_id: 'r1',
    },
  })

beforeEach(() => {
  mocks.apiJson.mockReset()
  mocks.toastApiError.mockReset()
  mocks.setBottomBarAction.mockReset()
})

describe('disabledReasonOf', () => {
  it('reads the DisabledReason out of a start 403 and ignores everything else', () => {
    expect(disabledReasonOf(gate403())).toBe('REMEDIATION_REQUIRED')
    expect(disabledReasonOf(new APIError({ code: 'forbidden', status: 403, message: 'denied' }))).toBeNull()
    expect(
      disabledReasonOf(new APIError({ code: 'conflict', status: 409, message: 'MAX_ATTEMPTS_REACHED' })),
    ).toBeNull()
    expect(disabledReasonOf(new Error('REMEDIATION_REQUIRED'))).toBeNull()
  })
})

describe('InlineAssessmentWorkspace (BUG-158)', () => {
  it('refetches attempt-state on a gated retry instead of the generic toast', async () => {
    mocks.vm = { ...base, recommendedAction: 'viewResult', isResultVisible: true, canSubmit: true }
    mocks.apiJson.mockRejectedValueOnce(gate403())
    const { invalidate } = renderWorkspace()
    fireEvent.click(screen.getByRole('button', { name: 'retryAssessment' }))
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.assessments.attemptState('asm-1') }),
    )
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['remediation-sessions'] })
    expect(mocks.toastApiError).not.toHaveBeenCalled()
  })

  it('still toasts a plain 403 — and refetches attempt-state so the page follows (UX-153)', async () => {
    mocks.vm = { ...base, recommendedAction: 'viewResult', isResultVisible: true, canSubmit: true }
    mocks.apiJson.mockRejectedValueOnce(new APIError({ code: 'forbidden', status: 403, message: 'denied' }))
    const { invalidate } = renderWorkspace()
    fireEvent.click(screen.getByRole('button', { name: 'retryAssessment' }))
    await waitFor(() => expect(mocks.toastApiError).toHaveBeenCalledTimes(1))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.assessments.attemptState('asm-1') })
  })
})

describe('InlineAssessmentWorkspace pending retake (UX-097)', () => {
  it('keeps the bar on «pending grade» and offers the retake on the card', () => {
    mocks.vm = {
      ...base,
      recommendedAction: 'start',
      releaseState: 'AWAITING_RELEASE',
      canSubmit: true,
      canStart: true,
    }
    renderWorkspace()
    expect(mocks.setBottomBarAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ label: 'pendingGrade', disabled: true }),
    )
    expect(screen.getByTestId('start-new-attempt')).toBeInTheDocument()
  })

  it('offers «start» in the bar when nothing is pending', () => {
    mocks.vm = { ...base, recommendedAction: 'start', releaseState: 'HIDDEN', submissionStatus: null, canStart: true }
    renderWorkspace()
    expect(mocks.setBottomBarAction).toHaveBeenLastCalledWith(expect.objectContaining({ label: 'startAssessment' }))
    expect(screen.queryByTestId('start-new-attempt')).toBeNull()
  })
})
