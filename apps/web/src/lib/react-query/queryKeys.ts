export const queryKeys = {
  ai: {
    usage: () => ['ai-usage'] as const,
    adminSettings: () => ['ai-admin-settings'] as const,
    evalDashboard: () => ['ai-eval-dashboard'] as const,
    operationRuns: (filters: object) => ['ai-operation-runs', filters] as const,
    operationRun: (runUuid: string | null) => ['ai-operation-run', runUuid] as const,
  },
  activities: {
    detail: (activityUuid: string) => ['activities', 'detail', activityUuid] as const,
    linkPreview: (url: string) => ['activities', 'link-preview', url] as const,
  },
  assessments: {
    /** Prefix: every assessment read (a lifted gate or an enrolment changes them all). */
    all: () => ['assessments'] as const,
    /** Prefix: every per-activity copy (`activity`, `studio`, `review`, `activityDetail`). */
    activityAll: () => ['assessments', 'activity'] as const,
    attemptState: (assessmentUuid: string | null | undefined) =>
      ['assessments', 'attempt-state', assessmentUuid || 'missing'] as const,
    mySubmissions: (assessmentUuid: string | null | undefined) =>
      ['assessments', 'submissions', 'me', assessmentUuid || 'missing'] as const,
    activity: (activityUuid: string) => ['assessments', 'activity', activityUuid] as const,
    // Each consumer caches its own shape under the `activity` prefix, so the
    // raw-wire key never carries a projection and a prefix invalidation of
    // `activity(id)` still refreshes all of them.
    studio: (activityUuid: string) => ['assessments', 'activity', activityUuid, 'studio'] as const,
    review: (activityUuid: string) => ['assessments', 'activity', activityUuid, 'review'] as const,
    access: (assessmentUuid: string) => ['assessments', 'access', assessmentUuid] as const,
    overrides: (assessmentUuid: string) => ['assessments', 'overrides', assessmentUuid] as const,
    activityDetail: (activityUuid: string, assessmentUuid: string | null | undefined) =>
      ['assessments', 'activity', activityUuid, assessmentUuid || 'missing'] as const,
    detail: (assessmentUuid: string) => ['assessments', 'detail', assessmentUuid] as const,
    draft: (assessmentUuid: string | null | undefined) =>
      ['assessments', 'draft', assessmentUuid || 'missing'] as const,
    itemAnalytics: (assessmentUuid: string) => ['assessments', 'item-analytics', assessmentUuid] as const,
    readiness: (assessmentUuid: string) => ['assessments', 'readiness', assessmentUuid] as const,
    stats: (assessmentUuid: string) => ['assessments', 'submission-stats', assessmentUuid] as const,
  },
  codeChallenges: {
    languages: () => ['code-challenges', 'languages'] as const,
    settings: (activityUuid: string) => ['code-challenges', 'settings', activityUuid] as const,
    submissions: (activityUuid: string) => ['code-challenges', 'submissions', activityUuid] as const,
  },
  certifications: {
    course: (courseUuid: string) => ['certifications', 'course', courseUuid] as const,
    detail: (certificateUuid: string) => ['certifications', 'detail', certificateUuid] as const,
    userAll: () => ['certifications', 'user-all'] as const,
  },
  collections: {
    list: () => ['collections', 'list'] as const,
  },
  courses: {
    collectionPicker: (q: string) => ['courses', 'collection-picker', q] as const,
    contributors: (courseUuid: string) => ['courses', 'contributors', courseUuid] as const,
    readiness: (courseUuid: string) => ['courses', courseUuid, 'readiness'] as const,
    learners: (courseUuid: string) => ['courses', 'learners', courseUuid] as const,
    /** `GET /courses/{id}/learners` (the roster tab), per search. */
    roster: (courseUuid: string, q?: string) =>
      ['courses', 'roster', courseUuid, ...(q === undefined ? [] : [q])] as const,
    usergroups: (courseUuid: string) => ['courses', 'usergroups', courseUuid] as const,
    metadata: (courseUuid: string) => ['courses', 'metadata', courseUuid] as const,
    updates: (courseUuid: string) => ['courses', 'updates', courseUuid] as const,
  },
  discussions: {
    list: (courseUuid: string, includeReplies = false) =>
      ['courses', 'discussions', courseUuid, { includeReplies }] as const,
    replies: (courseUuid: string, discussionUuid: string, limit = 50, offset = 0) =>
      ['courses', 'discussion-replies', courseUuid, discussionUuid, { limit, offset }] as const,
  },
  grading: {
    /** Prefix: every grading read (the course grading stream refreshes them all). */
    all: () => ['grading'] as const,
    detail: (submissionUuid: string, assessmentUuid: string) =>
      ['grading', 'submission', assessmentUuid, submissionUuid] as const,
    gradebook: (courseUuid: string) => ['grading', 'gradebook', courseUuid] as const,
    stats: (assessmentUuid: string) => ['grading', 'submission-stats', assessmentUuid] as const,
    submissions: (params: {
      assessmentUuid: string
      page: number
      pageSize: number
      search: string
      sortBy: string
      sortDir: 'asc' | 'desc'
      status: string
      lateOnly?: boolean
    }) => ['grading', 'submissions', params] as const,
  },
  landing: {
    courses: (page: number, limit: number) => ['landing', 'courses', { page, limit }] as const,
  },
  search: {
    content: (query: string, page: number, limit: number) => ['search', 'content', { query, page, limit }] as const,
    people: (query: string) => ['search', 'people', query] as const,
  },
  studentActivity: {
    /** Prefix: every activity runtime. */
    all: () => ['student-activity'] as const,
    runtime: (courseUuid: string, activityUuid: string) =>
      ['student-activity', 'runtime', courseUuid, activityUuid] as const,
  },
  platform: {
    config: () => ['platform', 'config'] as const,
    courses: () => ['platform', 'courses'] as const,
  },
  trail: {
    current: () => ['trail', 'current'] as const,
    leaderboard: (limit = 10) => ['trail', 'leaderboard', { limit }] as const,
  },
  userGroups: {
    all: () => ['user-groups', 'all'] as const,
    resource: (resourceId: string) => ['user-groups', 'resource', resourceId] as const,
    users: (userGroupId: string | number) => ['user-groups', 'users', userGroupId] as const,
  },
  auth: {
    session: () => ['auth', 'session'] as const,
    sessions: () => ['auth', 'sessions'] as const,
    totpQr: (uri: string) => ['totp-qr', uri] as const,
  },
  certificatePdf: (key: readonly unknown[]) => ['certificate-pdf', ...key] as const,
  courseQa: {
    threads: (courseUuid: string) => ['course-qa-threads', courseUuid] as const,
    thread: (courseUuid: string, threadUuid: string) => ['course-qa-thread', courseUuid, threadUuid] as const,
  },
  fileSubmissions: {
    /** Prefix: every file-submission read (learner, studio and review). */
    all: () => ['file-submission'] as const,
    activity: (activityUuid: string) => ['file-submission', 'activity', activityUuid] as const,
    gradingHistory: (attemptId: string) => ['file-submission', 'grading-history', attemptId] as const,
  },
  learnerCourse: {
    /** Prefix: every learner-state projection. */
    all: () => ['learner-course'] as const,
    state: (courseUuid: string) => ['learner-course', courseUuid, 'state'] as const,
  },
  notifications: {
    /** Prefix: the bell's count and list. */
    all: () => ['notifications'] as const,
    unreadCount: () => ['notifications', 'unread-count'] as const,
    list: () => ['notifications', 'list'] as const,
  },
  remediation: {
    /** Prefix: every remediation-session read. */
    all: () => ['remediation-sessions'] as const,
    mine: (userId: string) => ['remediation-sessions', 'mine', userId] as const,
  },
  users: {
    me: () => ['users', 'me'] as const,
    adminAll: () => ['users', 'admin'] as const,
    admin: (params: { q?: string }) => [...queryKeys.users.adminAll(), params] as const,
    byId: (userId: string) => ['users', 'detail', userId] as const,
    byUsername: (username: string) => ['users', 'username', username] as const,
    roles: () => ['users', 'roles'] as const,
  },
}
