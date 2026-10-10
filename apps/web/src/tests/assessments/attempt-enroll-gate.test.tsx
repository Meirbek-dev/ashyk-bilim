/** @vitest-environment jsdom */
// Cluster G: a course that takes assessments from enrolled learners only
// answers `NOT_ENROLLED`; the blocked card says so and offers «Записаться на
// курс», which enrols through `POST /enrollments/{course}` and refetches the
// attempt state (the page flips to «Начать» without a reload).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vite-plus/test'

import AttemptEntryCard from '@/features/assessments/shell/AttemptEntryCard'
import { DEFAULT_POLICY_VIEW } from '@/features/assessments/domain/policy'
import type { AttemptViewModel } from '@/features/assessments/domain/view-models'
import ruMessages from '@/messages/ru-RU.json'

const mocks = vi.hoisted(() => ({ apiJson: vi.fn() }))
vi.mock('@/lib/api-client', () => ({ apiJson: mocks.apiJson }))
vi.mock('@/lib/cache/revalidate', () => ({ revalidateTags: vi.fn().mockResolvedValue(undefined) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const vm = {
  kind: 'TYPE_CUSTOM',
  title: 'Тест 1',
  activityUuid: 'a1',
  courseUuid: 'c1',
  recommendedAction: 'blocked',
  submissionStatus: null,
  disabledActionReasons: ['NOT_ENROLLED'],
  policy: DEFAULT_POLICY_VIEW,
  items: [],
} as unknown as AttemptViewModel

describe('the enrolment gate on the attempt page (cluster G)', () => {
  it('names the reason, enrols and refetches the attempt state', async () => {
    mocks.apiJson.mockResolvedValue({})
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    render(
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale="ru" messages={ruMessages} timeZone="UTC">
          <AttemptEntryCard vm={vm} />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    )
    expect(screen.getByText(ruMessages.AttemptActions.blockedReasons.NOT_ENROLLED)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: ruMessages.AttemptActions.enrollToTake }))
    await waitFor(() => expect(mocks.apiJson).toHaveBeenCalledWith('enrollments/c1', { method: 'POST' }))
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['assessments'] }))
  })
})
