/** @vitest-environment jsdom */

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vite-plus/test'

// v2 `Activity` carries no `can_update` / `can_delete`; the curriculum row
// derives them from the session grants + course `creator_id` like the course
// workspace does. Before this, the creator saw no rename / publish / delete
// controls on any activity.

const harness = vi.hoisted(() => ({
  permissions: new Set<string>(),
  userId: 'teacher-1',
  creatorId: 'teacher-1',
  contributorIds: [] as string[],
  lifecycle: undefined as string | undefined,
  updateActivity: vi.fn<() => Promise<unknown>>(),
  toastApiError: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/hooks/useSession', () => ({
  useSession: () => ({
    can: (resource: string, action: string, scope: string) => harness.permissions.has(`${resource}:${action}:${scope}`),
    session: { userId: harness.userId },
  }),
}))
vi.mock('@components/Contexts/CourseContext', () => ({
  useCourse: () => ({
    courseStructure: {
      course_uuid: 'course-1',
      creator_id: harness.creatorId,
      contributor_ids: harness.contributorIds,
    },
  }),
}))
vi.mock('@/hooks/mutations/useActivityMutations', () => ({
  useActivityMutations: () => ({ deleteActivity: vi.fn(), updateActivity: harness.updateActivity }),
}))
vi.mock('@/components/Objects/Elements/Tooltip/Tooltip', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('@services/config/config', () => ({ getAbsoluteUrl: (path: string) => path, getSiteUrl: () => '' }))
vi.mock('@/i18n/navigation', () => ({
  Link: ({ prefetch: _prefetch, ...props }: React.ComponentProps<'a'> & { prefetch?: boolean }) => <a {...props} />,
}))
vi.mock('@/hooks/useApiError', () => ({ useApiError: () => ({ toastApiError: harness.toastApiError }) }))
vi.mock('sonner', () => ({
  toast: { error: harness.toastError, success: harness.toastSuccess, loading: vi.fn(), dismiss: vi.fn() },
}))
vi.mock('@/lib/api/generated/assessments/assessments', () => ({
  useListCourseAssessments: () => ({
    data: harness.lifecycle ? [{ activity_id: 'act-1', lifecycle: harness.lifecycle }] : undefined,
  }),
}))

import ActivityElement from '@/components/Dashboard/Pages/Course/EditCourseStructure/DraggableElements/ActivityElement'
import { APIError } from '@/lib/api/assertSuccess'

const activity = {
  id: 'act-1',
  activity_uuid: 'act-1',
  activity_type: 'TYPE_DYNAMIC' as const,
  name: 'Introduction Lecture',
  published: false,
}

// UX-104: the row reads the course's assessments (scheduled badge) through TanStack Query.
const renderRow = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } })}>
      <ActivityElement activity={activity} activityIndex={0} course_uuid="course-1" />
    </QueryClientProvider>,
  )

describe('ActivityElement capabilities (v2 grants)', () => {
  it('lets the course creator with `:own` grants rename, publish and delete', () => {
    harness.permissions = new Set(['activity:update:own', 'activity:delete:own'])
    harness.creatorId = 'teacher-1'
    renderRow()
    expect(screen.getByRole('button', { name: 'editButton' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'publish' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'deleteButton' })).toBeInTheDocument()
  })

  it('hides them for a non-creator holding only `:own` grants', () => {
    harness.permissions = new Set(['activity:update:own', 'activity:delete:own'])
    harness.creatorId = 'someone-else'
    renderRow()
    expect(screen.queryByRole('button', { name: 'editButton' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'publish' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'deleteButton' })).toBeNull()
  })

  it('an active contributor authors like the creator (`contributor_ids`)', () => {
    harness.permissions = new Set(['activity:update:own', 'activity:delete:own'])
    harness.creatorId = 'someone-else'
    harness.contributorIds = ['teacher-1']
    renderRow()
    expect(screen.getByRole('button', { name: 'publish' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'deleteButton' })).toBeInTheDocument()
    harness.contributorIds = []
  })

  it('a `user`-role co-author (no grants at all) authors like the creator', () => {
    harness.permissions = new Set()
    harness.creatorId = 'someone-else'
    harness.contributorIds = ['teacher-1']
    renderRow()
    expect(screen.getByRole('button', { name: 'publish' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'deleteButton' })).toBeInTheDocument()
    harness.contributorIds = []
  })

  // UX-200: unpublishing cuts learners off — a confirm first, then a result toast.
  it('asks before unpublishing and toasts the result', async () => {
    harness.permissions = new Set(['activity:update:own'])
    harness.creatorId = 'teacher-1'
    harness.updateActivity.mockReset().mockResolvedValue({})
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } })}>
        <ActivityElement activity={{ ...activity, published: true }} activityIndex={0} course_uuid="course-1" />
      </QueryClientProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'unpublish' }))
    expect(await screen.findByText('unpublishConfirmMessage')).toBeInTheDocument()
    expect(harness.updateActivity).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'unpublish' }))
    await waitFor(() => expect(harness.updateActivity).toHaveBeenCalledWith('act-1', { published: false }))
    await waitFor(() => expect(harness.toastSuccess).toHaveBeenCalledWith('unpublishedToast'))
  })

  it('platform-scoped grants apply to any course', () => {
    harness.permissions = new Set(['activity:update:platform'])
    harness.creatorId = 'someone-else'
    renderRow()
    expect(screen.getByRole('button', { name: 'publish' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'deleteButton' })).toBeNull()
  })

  // UX-124: a scheduled assessment publishes itself; the row shows «Запланировано»
  // with the hint instead of a toggle that would only 409.
  it('hides the publish toggle on a scheduled assessment and explains why', () => {
    harness.permissions = new Set(['activity:update:platform'])
    harness.lifecycle = 'scheduled'
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ActivityElement
          activity={{ ...activity, activity_type: 'TYPE_CUSTOM' as const }}
          activityIndex={0}
          course_uuid="course-1"
        />
      </QueryClientProvider>,
    )
    expect(screen.queryByRole('button', { name: 'publish' })).toBeNull()
    expect(screen.getByLabelText('scheduledHint')).toHaveTextContent('scheduled')
    harness.lifecycle = undefined
  })

  // UX-128: a locked quiz refuses the rename with a 409 — the toast is the
  // page-language lock copy, never the server's English `detail`.
  it('names the assessment lock on a refused rename instead of the raw detail', async () => {
    harness.permissions = new Set(['activity:update:platform'])
    harness.updateActivity.mockRejectedValueOnce(
      new APIError({ status: 409, code: 'conflict', message: 'scheduled assessments are read-only; unschedule first' }),
    )
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ActivityElement
          activity={{ ...activity, activity_type: 'TYPE_CUSTOM' as const }}
          activityIndex={0}
          course_uuid="course-1"
        />
      </QueryClientProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'editButton' }))
    fireEvent.change(screen.getByPlaceholderText('activityNamePlaceholder'), { target: { value: 'Renamed' } })
    fireEvent.click(screen.getByRole('button', { name: 'save' }))
    await waitFor(() => expect(harness.toastError).toHaveBeenCalledWith('lockedAssessment'))
    expect(harness.toastError).not.toHaveBeenCalledWith(expect.stringContaining('read-only'))
  })

  // BUG-186: deleting an assessment activity cascades its hand-ins — the confirm says so.
  it('warns about lost hand-ins when deleting an assessment activity', () => {
    harness.permissions = new Set(['activity:delete:platform'])
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ActivityElement
          activity={{ ...activity, activity_type: 'TYPE_CUSTOM' as const }}
          activityIndex={0}
          course_uuid="course-1"
        />
      </QueryClientProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'deleteButton' }))
    expect(screen.getByText('deleteAssessmentConfirmation')).toBeInTheDocument()
  })
})
