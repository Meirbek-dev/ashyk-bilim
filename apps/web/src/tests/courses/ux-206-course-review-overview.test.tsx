/** @vitest-environment jsdom */
// UX-206: the review page hands focus back to the visibility button after
// publish / make-private (the button is disabled mid-request, focus fell to
// <body>); the overview's «review» step completes once the course is public.
import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vite-plus/test'

import CourseOverview from '@/components/Dashboard/Courses/CourseOverview'
import CourseReviewPublish from '@/components/Dashboard/Courses/CourseReviewPublish'

const harness = vi.hoisted(() => ({
  isPublic: false,
  checklist: [] as { id: string; complete: boolean }[],
  updateAccess: vi.fn<() => Promise<unknown>>(),
}))

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/components/ui/AppLink', () => ({
  default: ({ prefetch: _prefetch, ...props }: React.ComponentProps<'a'> & { prefetch?: boolean }) => <a {...props} />,
}))
vi.mock('@components/Contexts/CourseContext', () => ({
  useCourse: () => ({
    courseStructure: { course_uuid: 'course-1', public: harness.isPublic, update_date: '' },
    readiness: { checklist: harness.checklist },
  }),
}))
vi.mock('@/hooks/mutations/useCoursesMutations', () => ({
  useCoursesMutations: () => ({ updateAccess: harness.updateAccess }),
}))
vi.mock('@services/courses/courses', () => ({
  getCourseReadiness: async () => ({ ready: true, issues: [] }),
}))

const capabilities = { canManageAccess: true } as React.ComponentProps<typeof CourseReviewPublish>['capabilities']

function renderReview() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <CourseReviewPublish courseuuid="course-1" capabilities={capabilities} />
    </QueryClientProvider>,
  )
}

describe('UX-206 course review + overview', () => {
  it('returns focus to the visibility button after a direct publish', async () => {
    harness.isPublic = false
    let settle: (value: unknown) => void = () => {}
    harness.updateAccess.mockReset().mockReturnValue(new Promise(resolve => (settle = resolve)))
    renderReview()
    const button = screen.getByRole('button', { name: 'publishCourse' })
    await waitFor(() => expect(button).toBeEnabled())
    button.focus()
    fireEvent.click(button)
    await waitFor(() => expect(button).toBeDisabled())
    // A browser drops focus from the disabled button to <body>; jsdom keeps it — emulate the browser.
    ;(document.activeElement as HTMLElement | null)?.blur()
    settle({})
    await waitFor(() => expect(document.activeElement).toBe(button))
  })

  it('returns focus to the visibility button after the make-private confirm', async () => {
    harness.isPublic = true
    let settle: (value: unknown) => void = () => {}
    harness.updateAccess.mockReset().mockReturnValue(new Promise(resolve => (settle = resolve)))
    renderReview()
    const button = screen.getByRole('button', { name: 'movePrivate' })
    button.focus()
    fireEvent.click(button)
    await screen.findByText('movePrivateConfirmMessage')
    fireEvent.click(screen.getAllByRole('button', { name: 'movePrivate' }).find(b => b !== button)!)
    await waitFor(() => expect(screen.queryByText('movePrivateConfirmMessage')).toBeNull())
    ;(document.activeElement as HTMLElement | null)?.blur()
    settle({})
    await waitFor(() => expect(harness.updateAccess).toHaveBeenCalledWith({ public: false }, expect.anything()))
    await waitFor(() => expect(document.activeElement).toBe(button))
  })

  it('completes the review step on a published course and hides «continue setup»', () => {
    harness.checklist = ['details', 'curriculum', 'access'].map(id => ({ id, complete: true }))
    harness.isPublic = true
    const { unmount } = render(<CourseOverview courseuuid="course-1" />)
    expect(screen.getAllByLabelText('completed')).toHaveLength(4)
    expect(screen.queryByText('continueSetup')).toBeNull()
    unmount()

    harness.isPublic = false
    render(<CourseOverview courseuuid="course-1" />)
    expect(screen.getAllByLabelText('completed')).toHaveLength(3)
    expect(screen.getByText('continueSetup').closest('a')?.getAttribute('href')).toContain('/review')
  })
})
