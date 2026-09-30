import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { getCourseWorkspaceCapabilitiesForCourse } from '@/lib/course-management-server'

/**
 * `getCourseWorkspaceCapabilitiesForCourse` (course-management-server.ts) used
 * to derive capabilities from the v1-only `courses/{id}/rights` route, which
 * does not exist in v2 and always answered 404 — 404ing the whole teacher
 * course workspace for every stage. It now derives capabilities from the
 * session's RBAC permission strings plus the course's `creator_id`, mirroring
 * the server's own/platform scope resolution
 * (apps/server/crates/core/src/permission.rs).
 */

const mocks = vi.hoisted(() => ({
  getCourseMetadata: vi.fn(),
  requireSession: vi.fn(),
  redirect: vi.fn(),
  getLocale: vi.fn(async () => 'ru'),
}))

vi.mock('@services/courses/courses', () => ({ getCourseMetadata: mocks.getCourseMetadata }))
vi.mock('@/lib/auth/session', () => ({ requireSession: mocks.requireSession }))
vi.mock('@/i18n/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('next-intl/server', () => ({ getLocale: mocks.getLocale }))

const courseId = '01a08bfb-2c9b-71b3-8985-d541d2b1716b'
const teacherId = '01a08bd6-a04f-76ac-92cd-4daaf9a31de7'
const otherCreatorId = '01a08bd6-a04f-70cc-bfc8-e6216333d3d4'

// Grant strings confirmed live: `POST /api/v2/auth/login` as teacher@ashyq.local.
const teacherPermissions = [
  'activity:create:own',
  'activity:delete:own',
  'activity:read:all',
  'activity:update:own',
  'analytics:export:assigned',
  'analytics:read:assigned',
  'assessment:grade:own',
  'assessment:*:own',
  'assessment:read:assigned',
  'certificate:create:platform',
  'certificate:delete:own',
  'certificate:read:own',
  'certificate:update:own',
  'chapter:create:own',
  'chapter:delete:own',
  'chapter:read:all',
  'chapter:update:own',
  'collection:create:platform',
  'collection:delete:own',
  'collection:manage:own',
  'collection:read:all',
  'collection:update:own',
  'course:create:platform',
  'course:delete:own',
  'course:manage:own',
  'course:read:all',
  'course:update:own',
]

// Grant strings confirmed live: `POST /api/v2/auth/login` as learner@ashyq.local.
const learnerPermissions = [
  'activity:read:all',
  'assessment:read:assigned',
  'assessment:submit:assigned',
  'certificate:read:own',
  'chapter:read:all',
  'collection:read:all',
  'course:enroll:all',
  'course:read:all',
]

function session(userId: string, permissions: string[]) {
  return { userId, permissions, roles: [], user: { id: userId } }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getLocale.mockResolvedValue('ru')
})

describe('getCourseWorkspaceCapabilitiesForCourse', () => {
  it('grants edit capabilities to the teacher who created the course', async () => {
    mocks.requireSession.mockResolvedValue(session(teacherId, teacherPermissions))
    mocks.getCourseMetadata.mockResolvedValue({ course_uuid: courseId, creator_id: teacherId })

    const caps = await getCourseWorkspaceCapabilitiesForCourse(courseId)

    expect(caps.canViewWorkspace).toBe(true)
    expect(caps.canEditDetails).toBe(true)
    expect(caps.canEditCurriculum).toBe(true)
    expect(caps.canManageAccess).toBe(true)
    expect(caps.canManageCollaboration).toBe(true)
    expect(caps.canDeleteCourse).toBe(true)
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it('does not leak an :own grant to a teacher who did not create the course', async () => {
    mocks.requireSession.mockResolvedValue(session(teacherId, teacherPermissions))
    mocks.getCourseMetadata.mockResolvedValue({ course_uuid: courseId, creator_id: otherCreatorId })

    const caps = await getCourseWorkspaceCapabilitiesForCourse(courseId)

    expect(caps.canEditDetails).toBe(false)
    expect(caps.canEditCurriculum).toBe(false)
    expect(caps.canManageAccess).toBe(false)
    expect(caps.canManageCollaboration).toBe(false)
    expect(caps.canDeleteCourse).toBe(false)
  })

  it('grants an admin (*:*:*) everything regardless of who created the course', async () => {
    mocks.requireSession.mockResolvedValue(session('01a08bd6-a04f-7706-9d43-fc87194bef1d', ['*:*:*']))
    mocks.getCourseMetadata.mockResolvedValue({ course_uuid: courseId, creator_id: otherCreatorId })

    const caps = await getCourseWorkspaceCapabilitiesForCourse(courseId)

    expect(caps).toMatchObject({
      canViewWorkspace: true,
      canCreateCourse: true,
      canEditDetails: true,
      canEditCurriculum: true,
      canManageAccess: true,
      canManageCollaboration: true,
      canManageSettings: true,
      canManageCertificate: true,
      canReviewCourse: true,
      canDeleteCourse: true,
    })
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it('a `user`-role active co-author edits the course like the creator (authorship is the :own scope)', async () => {
    const learnerId = '01a08bd6-a04f-70cc-bfc8-e6216333d3d4'
    mocks.requireSession.mockResolvedValue(session(learnerId, learnerPermissions))
    mocks.getCourseMetadata.mockResolvedValue({
      course_uuid: courseId,
      creator_id: teacherId,
      contributor_ids: [learnerId],
    })

    const caps = await getCourseWorkspaceCapabilitiesForCourse(courseId)

    expect(caps).toMatchObject({
      canViewWorkspace: true,
      canCreateCourse: false,
      canEditDetails: true,
      canEditCurriculum: true,
      canManageAccess: true,
      canManageCollaboration: true,
      canManageCertificate: true,
      canReviewCourse: true,
      canDeleteCourse: false,
    })
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it('sends a learner to /unauthorized with canViewWorkspace === false', async () => {
    mocks.requireSession.mockResolvedValue(session('01a08bd6-a04f-70cc-bfc8-e6216333d3d4', learnerPermissions))
    mocks.getCourseMetadata.mockResolvedValue({ course_uuid: courseId, creator_id: teacherId })

    const caps = await getCourseWorkspaceCapabilitiesForCourse(courseId)

    expect(caps.canViewWorkspace).toBe(false)
    expect(mocks.redirect).toHaveBeenCalledWith({ href: '/unauthorized', locale: 'ru' })
  })
})
