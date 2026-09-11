/** @vitest-environment jsdom */
// UX-009: the header badge must derive attempts/time limit from the same
// effective assessment policy the entry card renders, not from the
// learner-state runtime (which never carries max_attempts).

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vite-plus/test'

import InlineStatusStrip from '@/features/student-activity/shell/InlineStatusStrip'
import type { StudentActivityRuntime } from '@/features/student-activity/api/runtime'
import { DEFAULT_POLICY_VIEW } from '@/features/assessments/domain/policy'
import { queryKeys } from '@/lib/react-query/queryKeys'
import ruMessages from '@/messages/ru-RU.json'

vi.mock('@/features/assessments/hooks/useAssessment', () => ({
  useAssessmentAttempt: (activityUuid: string | null) =>
    activityUuid
      ? {
          vm: {
            surface: 'ATTEMPT',
            kind: 'TYPE_EXAM',
            vm: {
              assessmentUuid: 'asm-1',
              dueAt: null,
              policy: { ...DEFAULT_POLICY_VIEW, maxAttempts: 1, timeLimitSeconds: 50 * 60 },
            },
          },
          isLoading: false,
          error: null,
        }
      : { vm: null, isLoading: false, error: null },
}))

const runtime = {
  activity: { type: 'TYPE_EXAM', uuid: 'act-1', id: 'act-1', title: 'x', complete: false, published: true },
  policy: { due_at: null },
  progress: { state: 'not_started', attempt_count: 0 },
} as unknown as StudentActivityRuntime

describe('InlineStatusStrip (UX-009)', () => {
  it('shows the exam attempt limit and localized time limit from the effective policy', () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(queryKeys.assessments.attemptState('asm-1'), { attempts_used: 1 })
    render(
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider locale="ru" messages={ruMessages}>
          <InlineStatusStrip runtime={runtime} />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    )

    expect(screen.queryByText('Неограниченное количество попыток')).toBeNull()
    expect(screen.getByText('Использовано 1 из 1 попыток')).toBeInTheDocument()
    expect(screen.getByText('50 мин')).toBeInTheDocument()
    expect(screen.getByText('Тест')).toBeInTheDocument()
  })
})
