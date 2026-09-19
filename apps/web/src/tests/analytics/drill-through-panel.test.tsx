/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import DrillThroughAuditPanel from '@/components/Dashboard/Analytics/DrillThroughAuditPanel'
import { filenameFromContentDisposition } from '@/lib/download'

const t = Object.assign((key: string) => key, { has: () => false })
vi.mock('next-intl', () => ({ useTranslations: () => t, useLocale: () => 'ru' }))
const toastApiError = vi.fn()
vi.mock('@/hooks/useApiError', () => ({ useApiError: () => ({ toastApiError }) }))
const getTeacherDrillThrough = vi.fn()
vi.mock('@services/analytics/teacher', () => ({
  getTeacherDrillThrough: (...args: unknown[]) => getTeacherDrillThrough(...args),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('UX-122 drill-through audit panel', () => {
  it('renders the curated localized columns instead of the first six wire keys', async () => {
    getTeacherDrillThrough.mockResolvedValue({
      metric: 'backlog',
      total: 1,
      generated_at_unix: 0,
      items: [
        {
          age_hours: 30.5,
          assessment_id: 'a1',
          assessment_title: 'Quiz 1',
          assessment_type: 'quiz',
          course_id: 'c1',
          course_name: 'Rust',
          sla_breached: false,
          status: 'pending',
          submission_id: 's1',
          submitted_at_unix: 1_789_783_999,
          user_display_name: 'Aigerim',
          user_id: 'u1',
        },
      ],
    })
    render(<DrillThroughAuditPanel query={{} as never} assessmentPreview={[]} />)
    fireEvent.click(screen.getByText('drillThroughAuditPanel.metrics.backlog'))
    await waitFor(() => expect(screen.getByText('Aigerim')).toBeTruthy())
    expect(screen.getByText('drillThroughAuditPanel.columns.learner')).toBeTruthy()
    expect(screen.getByText('labels.status.pending')).toBeTruthy()
    expect(screen.getByText('labels.assessmentType.quiz')).toBeTruthy()
    expect(screen.getByText('drillThroughAuditPanel.no')).toBeTruthy()
    expect(screen.queryByText('1789783999')).toBeNull()
    expect(screen.queryByText(/course id|submission id/i)).toBeNull()
  })

  it('routes a failed load through the API error mapper', async () => {
    getTeacherDrillThrough.mockRejectedValue(new Error('missing permission analytics:read'))
    render(<DrillThroughAuditPanel query={{} as never} assessmentPreview={[]} />)
    fireEvent.click(screen.getByText('drillThroughAuditPanel.metrics.backlog'))
    await waitFor(() => expect(toastApiError).toHaveBeenCalled())
    expect(toastApiError.mock.calls[0]?.[1]).toEqual({ fallback: 'drillThroughAuditPanel.couldNotLoadRows' })
  })
})

describe('UX-122 export filename from Content-Disposition', () => {
  it('prefers the server name and falls back to the URL-derived one', () => {
    expect(filenameFromContentDisposition('attachment; filename="teacher-at-risk.csv"', 'at-risk.csv')).toBe(
      'teacher-at-risk.csv',
    )
    expect(filenameFromContentDisposition("attachment; filename*=UTF-8''%D0%BE%D1%82%D1%87%D1%91%D1%82.csv", 'x')).toBe(
      'отчёт.csv',
    )
    expect(filenameFromContentDisposition(null, 'at-risk.csv')).toBe('at-risk.csv')
  })
})
