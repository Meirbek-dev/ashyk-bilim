/** @vitest-environment jsdom */
// UX-081: the dash rendered nested <main> landmarks (sidebar inset + shell + page).
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'

vi.mock('@components/Dashboard/Menus/DashSidebar', () => ({ default: () => null }))
vi.mock('@components/Dashboard/Menus/DashMobileMenu', () => ({ default: () => null }))

import DashShell from '@/app/[locale]/(platform)/dash/dash-shell'

describe('dash landmarks', () => {
  it('renders exactly one <main> around a page', () => {
    globalThis.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as never
    render(
      <DashShell>
        <section>body</section>
      </DashShell>,
    )
    expect(screen.getAllByRole('main')).toHaveLength(1)
  })
})
