/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { cleanup, render, screen } from '@testing-library/react'
import AssessmentLearnerRowsTable from '@/components/Dashboard/Analytics/AssessmentLearnerRowsTable'

const t = (key: string) => key
const formatter = { number: (v: number) => String(v).replace('.', ',') }
vi.mock('next-intl', () => ({ useTranslations: () => t, useLocale: () => 'ru', useFormatter: () => formatter }))

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
