import type { ComponentType } from 'react'

declare global {
  type AppJsonPrimitive = string | number | boolean | null
  type AppJsonValue = AppJsonPrimitive | AppJsonValue[] | { [key: string]: AppJsonValue }
  interface AppPayload {
    [key: string]: unknown
    activity?: AppPayload
    activity_uuid?: string
    course_uuid?: string
    data?: AppPayload
    description?: string
    detail?: string
    details?: AppPayload & {
      subtitles?: { file?: File; id?: number | string; label?: string; language?: string }[]
    }
    filename?: string
    id?: number | string
    message?: string
    name?: string
    order?: number
    status?: number
    success?: boolean
    title?: string
    type?: string
    update_date?: string
    url?: string
  }
  type AppTranslationValues = Record<string, string | number | boolean | Date | null | undefined>
  type AppTranslator = (key: string, values?: unknown) => string
  type AppIcon = ComponentType<
    {
      className?: string
      size?: number | string
      strokeWidth?: number | string
      [key: string]: unknown
    }
  >

  interface AppApiError extends Error {
    code?: string
    data?: unknown
    detail?: unknown
    payload?: unknown
    requestId?: string | null
    status?: number
    statusCode?: number
  }

  interface AppMutationContext {
    activityKey?: readonly unknown[]
    editorBundleKey?: readonly unknown[] | null
    previousActivity?: unknown
    previousEditorBundle?: unknown
    previousStructure?: unknown
  }

  interface AppCourseContextShape {
    courseStructure?: AppCourse
    withUnpublishedActivities?: boolean
  }

  interface AppFileActivityInput {
    activity: AppPayload
    chapterId: number
    file: File
    type: string
  }

  interface AppActivityModalProps {
    chapterId: number
    closeModal: () => void
    course?: AppCourse & AppCourseContextShape
    submitActivity?: (payload: AppPayload) => Promise<void>
    submitExternalVideo?: (externalVideoData: AppPayload, activity: AppPayload, chapterId: number) => Promise<void>
    submitFileActivity?: (params: AppFileActivityInput) => Promise<void>
  }

  interface AppUserSummary {
    id?: number
    user_id?: number
    user_uuid?: string
    username?: string
    email?: string
    first_name?: string
    middle_name?: string | null
    last_name?: string
    avatar_image?: string | null
    role?: string | AppRoleSummary
    roles?: AppRoleSummary[]
    [key: string]: unknown
  }

  interface AppRoleSummary {
    id?: number
    name?: string
    priority?: number
    role?: string | AppRoleSummary
    [key: string]: unknown
  }

  interface AppCourseAuthor {
    id?: number | string
    user_id?: number
    authorship?: string
    authorship_status?: string
    user?: AppUserSummary
    [key: string]: unknown
  }

  interface AppActivity {
    id?: number
    activity_uuid: string
    name?: string
    activity_type?: string
    activity_sub_type?: string | null
    description?: string | null
    details?: unknown
    content?: unknown
    public?: boolean
    published?: boolean
    complete?: boolean
    completed?: boolean
    can_update?: boolean
    can_delete?: boolean
    is_owner?: boolean
    is_creator?: boolean
    available_actions?: string[]
    [key: string]: unknown
  }

  interface AppChapter {
    id?: number
    chapter_uuid?: string
    name?: string
    description?: string | null
    activities?: AppActivity[]
    [key: string]: unknown
  }

  interface AppCourse {
    id?: number
    course_uuid: string
    name?: string
    description?: string
    about?: string
    learnings?: string | string[] | AppPayload | null
    tags?: string[] | string | null
    public?: boolean
    thumbnail_image?: string | null
    thumbnail_type?: 'image' | 'video' | 'both' | string | null
    thumbnail_video?: string | null
    chapters?: AppChapter[]
    authors?: AppCourseAuthor[]
    update_date?: string
    creation_date?: string
    [key: string]: unknown
  }

  interface AppTrailStep {
    activity_id?: number | string
    complete?: boolean
    completed?: boolean
    [key: string]: unknown
  }

  interface AppTrailRun {
    course?: Pick<AppCourse, 'course_uuid' | 'id' | 'name'> | null
    steps?: AppTrailStep[]
    [key: string]: unknown
  }

  interface AppTrailData {
    runs?: AppTrailRun[]
    recent_transactions?: unknown[]
    [key: string]: unknown
  }

  interface AppUserGroup {
    id?: number
    usergroup_id?: number
    usergroup_uuid?: string
    name?: string
    description?: string
    users?: AppUserSummary[]
    [key: string]: unknown
  }

  interface AppCollection {
    id?: number
    collection_uuid?: string
    name?: string
    description?: string
    courses?: AppCourse[] | number[]
    [key: string]: unknown
  }

  interface AppDiscussionReply {
    id: number
    author?: AppUserSummary | null
    content?: string
    created_at?: string
    updated_at?: string
    likes_count?: number
    is_liked?: boolean
    [key: string]: unknown
  }

  interface AppDiscussionPost extends AppDiscussionReply {
    title?: string
    replies?: AppDiscussionReply[]
  }

  interface AppCertification {
    id?: number
    certification_uuid?: string
    course?: AppCourse
    [key: string]: unknown
  }
}

export {}
