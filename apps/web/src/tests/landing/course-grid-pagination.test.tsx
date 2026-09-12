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
    render(<CourseGridClient initialCourses={[]} initialTotal={45} trailData={null} currentPage={1} isAuthenticated />)
    const prev = screen.getByLabelText('previousAria')
    expect(prev).not.toHaveAttribute('href')
    expect(prev).toHaveAttribute('aria-disabled', 'true')
    const next = screen.getByLabelText('nextAria')
    expect(next).toHaveAttribute('href', '?page=2')
    expect(next).not.toHaveAttribute('aria-disabled')
    expect(document.querySelectorAll('a[href="#"]')).toHaveLength(0)
  })
})
