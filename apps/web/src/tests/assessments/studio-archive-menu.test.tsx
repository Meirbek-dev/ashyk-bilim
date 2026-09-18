/** @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'

// BUG-163: the studio «Архивировать» menu item was a dead click (Base UI
// `Menu.Item` fires `onClick`, not Radix `onSelect`) and its handler posted
// `{to:'ARCHIVED', scheduled_at:null}` (422: `to` is lowercase, the field is
// `scheduled_at_unix`).

const mocks = vi.hoisted(() => ({ apiJson: vi.fn(async () => ({})) }))

vi.mock('@/lib/api-client', () => ({ apiJson: mocks.apiJson }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => 'ru' }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
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
        lifecycle: 'PUBLISHED',
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

describe('studio archive menu item', () => {
  it('fires on click and posts the lowercase lifecycle body', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AssessmentStudioWorkspace courseUuid="course-1" activityUuid="act-1" />
      </QueryClientProvider>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'archive' }))
    await act(async () => {})

    expect(mocks.apiJson).toHaveBeenCalledTimes(1)
    const [path, init] = mocks.apiJson.mock.calls[0] as unknown as [string, RequestInit]
    expect(path).toBe('assessments/asm-1/lifecycle')
    expect(JSON.parse(String(init.body))).toEqual({ to: 'archived', scheduled_at_unix: null })
  })
})
