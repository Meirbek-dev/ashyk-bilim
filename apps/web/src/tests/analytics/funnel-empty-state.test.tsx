/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { cleanup, render, screen } from '@testing-library/react'
import CompletionFunnelChart from '@/components/Dashboard/Analytics/CompletionFunnelChart'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

afterEach(cleanup)

describe('UX-075 funnel chart', () => {
  it('renders empty-state copy instead of a blank chart when there are no steps', () => {
    render(<CompletionFunnelChart title="Отсев по главам" description="" data={[]} />)
    expect(screen.getByText('funnel.empty')).toBeTruthy()
    expect(document.querySelector('[data-slot="chart"]')).toBeNull()
  })
})
