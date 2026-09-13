/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { cleanup, render, screen } from '@testing-library/react'
import { InterventionStateBadge } from '@/components/Dashboard/Analytics/AtRiskLearnersTable'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/i18n/navigation', () => ({ Link: () => null, useRouter: () => ({}) }))

const base = { risk_trend: 'stable', intervention_count: 1, risk_score_delta: null } as never

afterEach(cleanup)

describe('UX-073 watchlist badge follows the latest intervention', () => {
  it('a completed message is not «open»; a planned meeting is', () => {
    render(<InterventionStateBadge row={{ ...base, last_intervention_type: 'message_sent' }} />)
    expect(screen.getByText('intervention.completed')).toBeTruthy()
    cleanup()
    render(<InterventionStateBadge row={{ ...base, last_intervention_type: 'meeting_scheduled' }} />)
    expect(screen.getByText('intervention.open')).toBeTruthy()
  })
})
