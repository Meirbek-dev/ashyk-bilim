/** @vitest-environment jsdom */

import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

/**
 * Collaboration page on the v2 contract: the roster comes from
 * `GET /courses/{id}/contributors` (creator synthesized first), pending
 * applications are approved through `PATCH …/{user_id} {status: active}`,
 * and `useContributorStatus` reads the caller's own row.
 */

const api = vi.hoisted(() => ({
  listContributors: vi.fn(),
  addContributor: vi.fn(),
  updateContributor: vi.fn(),
  removeContributor: vi.fn(),
  applyContributor: vi.fn(),
}))
const harness = vi.hoisted(() => ({ userId: 'creator-1', permissions: new Set<string>() }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), loading: vi.fn(), dismiss: vi.fn() }))

vi.mock('@/lib/api/generated/courses/courses', () => api)
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values?.username ? `${key}:${String(values.username)}` : key,
  useLocale: () => 'ru-RU',
}))
vi.mock('sonner', () => ({ toast }))
vi.mock('@/hooks/useSession', () => ({
  useSession: () => ({
    session: { userId: harness.userId, permissions: [...harness.permissions] },
    can: (resource: string, action: string, scope: string) => harness.permissions.has(`${resource}:${action}:${scope}`),
  }),
}))
vi.mock('@/hooks/useApiError', () => ({ useApiError: () => ({ toastApiError: vi.fn() }) }))
vi.mock('@components/Contexts/CourseContext', () => ({
  useCourse: () => ({ courseStructure: { course_uuid: 'course-1', open_to_contributors: true, update_date: '' } }),
}))
vi.mock('@/hooks/mutations/useCoursesMutations', () => ({ useCoursesMutations: () => ({ updateAccess: vi.fn() }) }))
vi.mock('@/features/courses/editor/hooks/useCourseSectionDraft', () => ({
  useCourseSectionDraft: () => ({ draft: true, setDraft: vi.fn(), isDirty: false, discard: vi.fn(), markClean: vi.fn() }),
}))
vi.mock('@/hooks/useSaveSection', () => ({ useSaveSection: () => ({ isSaving: false, save: vi.fn() }) }))
vi.mock('@/features/search/hooks/useSearch', () => ({
  useSearchContent: () => ({ data: undefined, isFetching: false, isError: false, error: null }),
}))
vi.mock('@services/media/media', () => ({ getUserAvatarMediaDirectory: () => '' }))
vi.mock('@components/Objects/UserAvatar', () => ({ default: () => <span /> }))
// base-ui's viewport animation probe is not available in jsdom.
vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

import EditCourseContributors from '@/components/Dashboard/Pages/Course/EditCourseContributors/EditCourseContributors'
import { useContributorStatus } from '@/hooks/useContributorStatus'

const creator = {
  user_id: 'creator-1',
  username: 'teacher',
  display_name: 'Teacher',
  avatar_key: null,
  role: 'creator',
  status: 'active',
  created_at_unix: 1_700_000_000,
}
const applicant = { ...creator, user_id: 'helper-1', username: 'helper', display_name: 'Helper', role: 'contributor', status: 'pending' }

const renderWithClient = (ui: React.ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

function StatusProbe() {
  const { contributorStatus, contributorRole } = useContributorStatus('course-1')
  return <output>{`${contributorStatus}/${contributorRole ?? '-'}`}</output>
}

describe('course collaboration (v2 roster)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    harness.userId = 'creator-1'
    harness.permissions = new Set()
    api.listContributors.mockResolvedValue([creator, applicant])
    api.updateContributor.mockResolvedValue({ ...applicant, status: 'active' })
  })

  it('the creator sees the roster and approves a pending application', async () => {
    renderWithClient(<EditCourseContributors />)

    await screen.findByTestId('contributor-helper')
    expect(api.listContributors).toHaveBeenCalledWith('course-1')
    // The creator row is present and has no actions.
    expect(screen.getByTestId('contributor-teacher')).toBeInTheDocument()
    expect(screen.getByTestId('contributor-teacher').querySelector('button')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'approveButton' }))
    await waitFor(() => expect(api.updateContributor).toHaveBeenCalledWith('course-1', 'helper-1', { status: 'active' }))
    expect(toast.success).toHaveBeenCalledWith('successfullyUpdatedContributor')
  })

  it('a plain contributor gets a read-only roster', async () => {
    harness.userId = 'helper-1'
    api.listContributors.mockResolvedValue([creator, { ...applicant, status: 'active' }])
    renderWithClient(<EditCourseContributors />)

    await screen.findByTestId('contributor-helper')
    expect(screen.getByText('rosterReadOnlyTitle')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'removeButton' })).toBeNull()
    expect(screen.queryByLabelText('searchUsersPlaceholder')).toBeNull()
  })

  it('useContributorStatus resolves the caller’s own row', async () => {
    harness.userId = 'helper-1'
    renderWithClient(<StatusProbe />)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('PENDING/contributor'))
  })
})
