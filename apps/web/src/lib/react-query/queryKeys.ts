export const queryKeys = {
  activities: {
    detail: (activityUuid: string) => ['activities', 'detail', activityUuid] as const,
    linkPreview: (url: string) => ['activities', 'link-preview', url] as const,
  },
  assessments: {
    activity: (activityUuid: string) => ['assessments', 'activity', activityUuid] as const,
    activityDetail: (activityUuid: string, assessmentUuid: string | null | undefined) =>
      ['assessments', 'activity', activityUuid, assessmentUuid || 'missing'] as const,
    detail: (assessmentUuid: string) => ['assessments', 'detail', assessmentUuid] as const,
    draft: (assessmentUuid: string | null | undefined) =>
      ['assessments', 'draft', assessmentUuid || 'missing'] as const,
    readiness: (assessmentUuid: string) => ['assessments', 'readiness', assessmentUuid] as const,
  },
  assignments: {
    activity: (activityUuid: string) => ['assignments', 'activity', activityUuid] as const,
    detail: (assignmentUuid: string) => ['assignments', 'detail', assignmentUuid] as const,
    submissions: (assignmentUuid: string) => ['assignments', 'submissions', assignmentUuid] as const,
    taskSubmission: (assignmentUuid: string, assignmentTaskUuid: string) =>
      ['assignments', 'task-submission', assignmentUuid, assignmentTaskUuid] as const,
    tasks: (assignmentUuid: string) => ['assignments', 'tasks', assignmentUuid] as const,
  },
  codeChallenges: {
    settings: (activityUuid: string) => ['code-challenges', 'settings', activityUuid] as const,
    submission: (submissionUuid: string) => ['code-challenges', 'submission', submissionUuid] as const,
    submissions: (activityUuid: string) => ['code-challenges', 'submissions', activityUuid] as const,
  },
  certifications: {
    course: (courseUuid: string) => ['certifications', 'course', courseUuid] as const,
    detail: (certificateUuid: string) => ['certifications', 'detail', certificateUuid] as const,
    userAll: () => ['certifications', 'user-all'] as const,
  },
  courses: {
    contributors: (courseUuid: string) => ['courses', 'contributors', courseUuid] as const,
    metadata: (courseUuid: string) => ['courses', 'metadata', courseUuid] as const,
    updates: (courseUuid: string) => ['courses', 'updates', courseUuid] as const,
  },
  discussions: {
    list: (courseUuid: string, includeReplies = false, limit = 50, offset = 0) =>
      ['courses', 'discussions', courseUuid, { includeReplies, limit, offset }] as const,
    replies: (courseUuid: string, discussionUuid: string, limit = 50, offset = 0) =>
      ['courses', 'discussion-replies', courseUuid, discussionUuid, { limit, offset }] as const,
  },
  exams: {
    activity: (activityUuid: string) => ['exams', 'activity', activityUuid] as const,
    allAttempts: (examUuid: string) => ['exams', 'attempts', 'all', examUuid] as const,
    attempts: (examUuid: string) => ['exams', 'attempts', examUuid] as const,
    config: () => ['exams', 'config'] as const,
    detail: (examUuid: string) => ['exams', 'detail', examUuid] as const,
    myAttempt: (examUuid: string) => ['exams', 'attempts', 'me', examUuid] as const,
    questions: (examUuid: string) => ['exams', 'questions', examUuid] as const,
  },
  grading: {
    detail: (submissionUuid: string, assessmentUuid?: string | null) =>
      ['grading', 'submission', assessmentUuid || 'legacy', submissionUuid] as const,
    gradebook: (courseUuid: string) => ['grading', 'gradebook', courseUuid] as const,
    mine: (activityId: number) => ['grading', 'my-submissions', activityId] as const,
    stats: (activityId: number, assessmentUuid?: string | null) =>
      ['grading', 'submission-stats', assessmentUuid || 'legacy', activityId] as const,
    submissions: (params: {
      activityId: number;
      assessmentUuid?: string | null;
      page: number;
      pageSize: number;
      search: string;
      sortBy: string;
      sortDir: 'asc' | 'desc';
      status: string;
    }) => ['grading', 'submissions', params] as const,
  },
  landing: {
    courses: (page: number, limit: number) => ['landing', 'courses', { page, limit }] as const,
  },
  search: {
    content: (query: string, page: number, limit: number) => ['search', 'content', { query, page, limit }] as const,
  },
  platform: {
    config: () => ['platform', 'config'] as const,
    courses: () => ['platform', 'courses'] as const,
    permissions: () => ['platform', 'permissions'] as const,
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
  users: {
    allMembers: () => ['users', 'members', 'all'] as const,
    basicList: (limit = 100) => ['users', 'basic-list', { limit }] as const,
    byId: (userId: number) => ['users', 'detail', userId] as const,
    byUsername: (username: string) => ['users', 'username', username] as const,
    courses: (userId: number) => ['users', 'courses', userId] as const,
    members: (page: number, perPage: number) => ['users', 'members', { page, perPage }] as const,
    roleAuditLog: (page: number, pageSize: number) => ['users', 'role-audit-log', { page, pageSize }] as const,
    roleAssignments: () => ['users', 'role-assignments'] as const,
    roles: () => ['users', 'roles'] as const,
  },
};
