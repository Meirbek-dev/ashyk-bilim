/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ dateTime: () => '', number: (n: number) => String(n) }),
}))
vi.mock('@components/Objects/Thumbnails/CourseThumbnail', () => ({ default: () => null }))

import CourseGridClient from '@components/Landings/CourseGridClient'

describe('catalog pagination edges', () => {
  it('renders the edge control as disabled instead of a href="#" link', () => {
    render(<CourseGridClient initialCourses={[]} hasNextPage trailData={null} currentPage={1} isAuthenticated />)
    const prev = screen.getByLabelText('previousAria')
    expect(prev).not.toHaveAttribute('href')
    expect(prev).toHaveAttribute('aria-disabled', 'true')
    const next = screen.getByLabelText('nextAria')
    expect(next).toHaveAttribute('href', '?page=2')
    expect(next).not.toHaveAttribute('aria-disabled')
    expect(document.querySelectorAll('a[href="#"]')).toHaveLength(0)
  })

  // UX-133: `?page=99` past the end rendered a fabricated «1 … 97 98» — the
  // contract has no total, so only prev/next exist, plus an empty state.
  it('past the end: no page numbers, next disabled, empty state links back to page 1', () => {
    render(
      <CourseGridClient initialCourses={[]} hasNextPage={false} trailData={null} currentPage={99} isAuthenticated />,
    )
    expect(screen.queryByText('98')).not.toBeInTheDocument()
    expect(screen.getByLabelText('nextAria')).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByLabelText('previousAria')).toHaveAttribute('href', '?page=98')
    expect(screen.getByText('pastEnd')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'backToFirst' })).toHaveAttribute('href', '?page=1')
  })
})
