/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { cleanup, render, screen } from '@testing-library/react'
import AssessmentLearnerRowsTable from '@/components/Dashboard/Analytics/AssessmentLearnerRowsTable'

const t = (key: string, values?: Record<string, unknown>) => (values ? `${key}:${JSON.stringify(values)}` : key)
const formatter = { number: (v: number) => String(v).replace('.', ',') }
vi.mock('next-intl', () => ({ useTranslations: () => t, useLocale: () => 'ru', useFormatter: () => formatter }))

const row = {
  user_id: 'u1',
  user_display_name: 'Aigerim',
  attempts: 3,
  best_score: 30,
  last_score: 30,
  submitted_at_unix: null,
  graded_at_unix: null,
  status: 'published',
  pending_attempt: null,
}

afterEach(cleanup)

describe('UX-135 assessment learner rows', () => {
  it('formats best/last scores like the KPI tiles (locale digits + %)', () => {
    render(
      <AssessmentLearnerRowsTable
        rows={[
          {
            user_id: 'u1',
            user_display_name: 'Aigerim',
            attempts: 3,
            best_score: 43.48,
            last_score: 30,
            submitted_at_unix: null,
            graded_at_unix: null,
            status: 'returned',
          } as never,
        ]}
      />,
    )
    expect(screen.getByText('43,48%')).toBeTruthy()
    expect(screen.getByText('30%')).toBeTruthy()
    expect(screen.queryByText('43.48')).toBeNull()
  })
})

describe('UX-138 assessment learner row status', () => {
  it('shows the grade of record status plus the pending retake', () => {
    render(<AssessmentLearnerRowsTable rows={[{ ...row, pending_attempt: 3 } as never]} />)
    expect(screen.getByText('labels.status.published')).toBeTruthy()
    expect(screen.getByText('pendingAttempt:{"attempt":3}')).toBeTruthy()
  })

  it('does not repeat the pending line when the ranked attempt is the pending one', () => {
    render(<AssessmentLearnerRowsTable rows={[{ ...row, status: 'pending', pending_attempt: 1 } as never]} />)
    expect(screen.getByText('labels.status.pending')).toBeTruthy()
    expect(screen.queryByText(/pendingAttempt/)).toBeNull()
  })
})
