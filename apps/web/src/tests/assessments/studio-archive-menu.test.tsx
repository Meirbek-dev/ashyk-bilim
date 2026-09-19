/** @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'

// BUG-163: the studio «Архивировать» menu item was a dead click (Base UI
// `Menu.Item` fires `onClick`, not Radix `onSelect`) and its handler posted
// `{to:'ARCHIVED', scheduled_at:null}` (422: `to` is lowercase, the field is
// `scheduled_at_unix`).

const mocks = vi.hoisted(() => ({
  apiJson: vi.fn(async () => ({})),
  toastError: vi.fn(),
  lifecycle: 'PUBLISHED' as 'PUBLISHED' | 'ARCHIVED',
}))

vi.mock('@/lib/api-client', () => ({ apiJson: mocks.apiJson }))
vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string, values?: Record<string, unknown>) => (values ? `${key}:${JSON.stringify(values)}` : key)
    t.has = () => false
    return t
  },
  useLocale: () => 'ru',
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: mocks.toastError } }))
vi.mock('@/features/assessments/registry', () => ({ loadKindModule: () => new Promise(() => {}) }))
vi.mock('@/features/ai-experience', () => ({
  ActivityAIDockLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ActivityAITrigger: () => null,
}))
vi.mock('@/features/course-qa', () => ({ CourseAIHub: () => null }))
vi.mock('@components/ui/AppLink', () => ({
  default: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))
// Base UI menus need real pointer sequences; the contract under test is the
// item's `onClick` prop, so the menu renders its items as plain buttons.
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: () => null,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode
    onClick?: () => void
    disabled?: boolean
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}))
vi.mock('@/features/assessments/hooks/useAssessment', () => ({
  useAssessmentStudio: () => ({
    isLoading: false,
    error: null,
    vm: {
      surface: 'STUDIO',
      kind: 'QUIZ',
      vm: {
        surface: 'STUDIO',
        kind: 'QUIZ',
        assessmentUuid: 'asm-1',
        activityUuid: 'act-1',
        title: 'Quiz',
        lifecycle: mocks.lifecycle,
        isEditable: false,
        canPublish: false,
        canSchedule: false,
        canArchive: true,
        scheduledAt: null,
        policy: {},
        items: [],
        validationIssues: [],
      },
    },
  }),
}))

import AssessmentStudioWorkspace from '@/features/assessments/studio/AssessmentStudioWorkspace'
import { APIError } from '@/lib/api/assertSuccess'

describe('studio archive menu item', () => {
  it('fires on click, posts the lowercase lifecycle body and refreshes the header badge (UX-107)', async () => {
    const queryClient = new QueryClient()
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
    render(
      <QueryClientProvider client={queryClient}>
        <AssessmentStudioWorkspace courseUuid="course-1" activityUuid="act-1" />
      </QueryClientProvider>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'archive' }))
    // UX-124: a published assessment asks first — learners lose access.
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('archiveConfirmTitle:{"title":"Quiz"}')
    expect(mocks.apiJson).not.toHaveBeenCalled()
    fireEvent.click((await screen.findAllByRole('button', { name: 'archive' })).at(-1)!)
    await act(async () => {})

    expect(mocks.apiJson).toHaveBeenCalledTimes(1)
    const [path, init] = mocks.apiJson.mock.calls[0] as unknown as [string, RequestInit]
    expect(path).toBe('assessments/asm-1/lifecycle')
    expect(JSON.parse(String(init.body))).toEqual({ to: 'archived', scheduled_at_unix: null })
    // The badge's vm query lives under `assessments.activity(id)`; `studio(id)` is only a child key.
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['assessments', 'activity', 'act-1'] })
  })

  // BUG-171: an archived assessment offers «Восстановить» (→ draft), and a
  // lifecycle 409 is a localized toast naming the refused stage, not raw English.
  it('restores an archived assessment to draft and localizes a lifecycle conflict', async () => {
    mocks.lifecycle = 'ARCHIVED'
    mocks.apiJson.mockClear()
    mocks.apiJson.mockRejectedValueOnce(
      new APIError({ code: 'conflict', message: 'cannot move from archived to published; allowed: draft', status: 409 }),
    )
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AssessmentStudioWorkspace courseUuid="course-1" activityUuid="act-1" />
      </QueryClientProvider>,
    )
    expect(screen.queryByRole('button', { name: 'archive' })).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: 'restore' }))
    await act(async () => {})

    const [path, init] = mocks.apiJson.mock.calls[0] as unknown as [string, RequestInit]
    expect(path).toBe('assessments/asm-1/lifecycle')
    expect(JSON.parse(String(init.body))).toEqual({ to: 'draft', scheduled_at_unix: null })
    expect(mocks.toastError).toHaveBeenCalledWith('lifecycleConflict:{"state":"lifecycle.draft"}')
  })
})
