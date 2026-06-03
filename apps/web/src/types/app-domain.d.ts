import type { ComponentType } from 'react'

declare global {
  type AppJsonPrimitive = string | number | boolean | null
  type AppJsonValue = AppJsonPrimitive | AppJsonValue[] | { [key: string]: AppJsonValue }
  interface AppPayload {
    [key: string]: unknown
    activity?: AppPayload | undefined
    activity_uuid?: string | undefined
    certification?: AppCertification | undefined
    collections?: AppCollection[] | undefined
    course?: AppCourse | undefined
    course_uuid?: string | undefined
    data?: AppPayload | undefined
    description?: string | undefined
    detail?: string | undefined
    details?: (AppPayload & {
      subtitles?: { file?: File | undefined; id?: number | string | undefined; label?: string | undefined; language?: string | undefined }[] | undefined
    }) | undefined
    filename?: string | undefined
    id?: number | string | undefined
    message?: string | undefined
    name?: string | undefined
    order?: number | undefined
    status?: number | undefined
    success?: boolean | undefined
    title?: string | undefined
    type?: string | undefined
    update_date?: string | undefined
    url?: string | undefined
    // Commonly accessed payload properties
    learnings?: string | string[] | null | undefined
    tags?: string | string[] | null | undefined
    visibility?: boolean | string | null | undefined
    template?: string | null | undefined
  }
  type AppTranslationValues = Record<string, string | number | Date>
  type AppTranslator = (key: string, values?: AppTranslationValues) => string
  type AppIcon = ComponentType<
    {
      className?: string
      size?: number
      strokeWidth?: number
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
    course_uuid?: string
    id?: number
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
    course?: AppCourse | AppCourseContextShape
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
    id?: number | string | null
    user_id?: number
    authorship?: string
    authorship_status?: string
    user?: AppUserSummary
    [key: string]: unknown
  }

  interface AppActivity {
    id?: number | string | null
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
    courseStructure?: AppCourse
    name?: string
    withUnpublishedActivities?: boolean
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
    created_at?: string
    [key: string]: unknown
  }

  interface AppTrailStep {
    activity_id?: number | string
    complete?: boolean
    completed?: boolean
    [key: string]: unknown
  }

  interface AppTrailRun {
    course: AppCourse
    steps?: AppTrailStep[]
    course_total_steps?: number
    [key: string]: unknown
  }

  interface AppTrailData {
    runs: AppTrailRun[]
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
  }

  interface AppDiscussionPost extends AppDiscussionReply {
    discussion_uuid?: string
    type?: 'post' | 'reply'
    status?: 'active' | 'hidden' | 'deleted'
    course_id?: number
    user_id?: number
    parent_discussion_id?: number
    dislikes_count?: number
    replies_count?: number
    creation_date?: string
    update_date?: string
    user?: AppUserSummary | null
    is_disliked?: boolean
    title?: string
    replies?: AppDiscussionReply[]
  }

  interface AppCertification {
    id?: number
    certification_uuid?: string
    course: AppCourse
    certificate_user: {
      user_certification_uuid: string
      created_at: string
      [key: string]: unknown
    }
    certification: {
      config: {
        certification_name: string
        certification_type: string
        certification_description?: string
        certificate_pattern?: string
        certificate_instructor?: string | null
        [key: string]: unknown
      }
      [key: string]: unknown
    }
    [key: string]: unknown
  }
}

export {}
