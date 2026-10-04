import { describe, expect, test } from 'vite-plus/test'

import type { Activity, Contributor, Course, LearnerCourseState } from '#/shared/api/gen/types.gen'

import { application, authorNames, curriculumSyllabus, outlineSyllabus, primaryAction } from './course'

const course = (patch: Partial<Course> = {}): Course => ({
  id: 'c1',
  version: 1,
  name: 'Course',
  about: '',
  description: '',
  allowed_actions: [],
  archived_at_unix: null,
  archived_by: null,
  contributor_ids: [],
  creator_id: null,
  created_at_unix: 0,
  updated_at_unix: 0,
  learnings: [],
  open_to_contributors: false,
  public: true,
  tags: [],
  thumbnail_key: null,
  thumbnail_video_key: null,
  ...patch,
})

const state = (patch: Partial<LearnerCourseState> = {}): LearnerCourseState => ({
  course_id: 'c1',
  title: 'Course',
  public: true,
  enrolled: false,
  enrollment_state: 'not_enrolled',
  permissions: { can_access: true, can_discover: true, can_enroll: true, denial_reason: null },
  progress: {
    completed_required_count: 0,
    total_required_count: 1,
    missing_required_count: 1,
    needs_grading_count: 0,
    progress_pct: 0,
    completed_at_unix: null,
    grade_average: null,
  },
  certificate: { configured: false, eligible: false, issued: false, href: null, verify_code: null },
  next_action: {
    id: 'enroll',
    label: 'Start course',
    reason: 'not_enrolled',
    enabled: true,
    activity_id: null,
    course_id: 'c1',
    href: null,
  },
  outline: [
    {
      id: 'ch1',
      title: 'Chapter',
      index: 0,
      activities: [
        {
          id: 'a1',
          title: 'Page',
          activity_type: 'dynamic',
          allowed_actions: [],
          available: true,
          blocked_reason: null,
          complete: true,
          due_at_unix: null,
          passed: null,
          score: null,
          is_late: false,
          required: true,
          state: 'complete',
        },
      ],
    },
  ],
  ...patch,
})

const row = (patch: Partial<Contributor>): Contributor => ({
  user_id: 'u1',
  version: 1,
  allowed_actions: [],
  username: 'u1',
  display_name: 'User',
  avatar_key: null,
  role: 'contributor',
  status: 'active',
  created_at_unix: 0,
  ...patch,
})

describe('primary action', () => {
  test('B-CRS-03 a guest is sent to sign in', () => {
    expect(primaryAction(course(), null)).toEqual({ kind: 'login' })
  })

  test('B-CRS-04 a signed-in user who may enrol gets "Enrol"; one who may not gets nothing', () => {
    expect(primaryAction(course(), state())).toEqual({ kind: 'enroll' })
    const closed = state({
      permissions: { can_access: true, can_discover: true, can_enroll: false, denial_reason: null },
    })
    expect(primaryAction(course(), closed)).toBeNull()
  })

  test("B-CRS-05 an enrolled learner continues at the server's next activity, or opens the summary", () => {
    const next = {
      label: 'Continue course',
      reason: 'next_required' as const,
      enabled: true,
      activity_id: 'a2',
      course_id: 'c1',
      href: null,
    }
    const enrolled = state({
      enrolled: true,
      enrollment_state: 'in_progress',
      next_action: { ...next, id: 'continue' },
    })
    expect(primaryAction(course(), enrolled)).toEqual({ kind: 'activity', action: 'continue', activityId: 'a2' })
    const done = state({
      enrolled: true,
      enrollment_state: 'completed',
      next_action: {
        id: 'review_completion',
        label: 'Review',
        reason: 'course_complete',
        enabled: true,
        activity_id: null,
        course_id: 'c1',
        href: null,
      },
    })
    expect(primaryAction(course(), done)).toEqual({ kind: 'complete', action: 'review_completion' })
  })

  test('B-CRS-06 staff who may not enrol get the workspace, never "Enrol"', () => {
    const staff = state({
      permissions: { can_access: true, can_discover: true, can_enroll: false, denial_reason: null },
    })
    expect(primaryAction(course({ allowed_actions: ['update'] }), staff)).toEqual({ kind: 'workspace' })
  })
})

describe('syllabus and progress', () => {
  test('B-CRS-09 a guest sees published activities only; an empty chapter is dropped', () => {
    const syllabus = curriculumSyllabus({
      chapters: [
        {
          id: 'ch1',
          course_id: 'c1',
          name: 'One',
          description: '',
          position: 1,
          version: 1,
          allowed_actions: [],
          activities: [
            { ...activity('a1'), published: true },
            { ...activity('a2'), published: false },
          ],
        },
        {
          id: 'ch2',
          course_id: 'c1',
          name: 'Two',
          description: '',
          position: 2,
          version: 1,
          allowed_actions: [],
          activities: [],
        },
      ],
    })
    expect(syllabus).toEqual([
      {
        id: 'ch1',
        title: 'One',
        activities: [{ id: 'a1', title: 'a1', type: 'video', complete: false, available: false }],
      },
    ])
  })

  test('B-CRS-10 completion and availability come from the learner state as the server sent them', () => {
    expect(outlineSyllabus(state({ enrolled: true }))[0]?.activities[0]).toMatchObject({
      complete: true,
      available: true,
    })
    // Not enrolled: nothing links into the player.
    expect(outlineSyllabus(state())[0]?.activities[0]).toMatchObject({ available: false })
  })
})

describe('authors and co-authorship', () => {
  test('B-CRS-02 authors: active rows, creator first, no reporters or pending applicants', () => {
    const roster = [
      row({ display_name: 'Maintainer', role: 'maintainer' }),
      row({ display_name: 'Creator', role: 'creator' }),
      row({ display_name: 'Reporter', role: 'reporter' }),
      row({ display_name: 'Applicant', status: 'pending' }),
    ]
    expect(authorNames(roster)).toEqual(['Creator', 'Maintainer'])
  })

  test('B-CRS-11 apply without an own row, withdraw with a pending one, nothing on a closed course', () => {
    const open = course({ open_to_contributors: true })
    expect(application(open, [], 'me')).toBe('apply')
    expect(application(open, [row({ user_id: 'me', status: 'pending' })], 'me')).toBe('pending')
    expect(application(open, [row({ user_id: 'me' })], 'me')).toBeNull()
    expect(application(course(), [], 'me')).toBeNull()
    expect(application(open, [], null)).toBeNull()
  })
})

function activity(id: string): Activity {
  return {
    id,
    name: id,
    chapter_id: 'ch1',
    course_id: 'c1',
    activity_type: 'video',
    activity_sub_type: 'video_youtube',
    allowed_actions: [],
    position: 1,
    published: true,
    version: 1,
  }
}
