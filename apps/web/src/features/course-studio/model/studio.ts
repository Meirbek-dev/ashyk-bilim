import * as v from 'valibot'

import type {
  ActivityDetail,
  ActivitySubType,
  ActivityType,
  AssessmentKind,
  Contributor,
  ContributorRole,
  FinalizedUpload,
  MediaContent,
  ReadinessItem,
} from '#/shared/api/gen/types.gen'
import { vContributorRole } from '#/shared/api/gen/valibot.gen'

/** A chapter's or an activity's new name: the contract types `name` as optional on update, a rename needs one. */
export const nameSchema = v.object({ name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500)) })

// ---- Readiness (`GET /courses/{id}/readiness`): codes are strings in the contract; these are the server's. ----

const READINESS_CODES = [
  'no-live-activity',
  'assessment-not-ready',
  'code-challenge-unconfigured',
  'file-submission-unpublished',
  'file-submission-not-ready',
  'activity-unpublished',
  'thumbnail-missing',
  'certificate-not-configured',
] as const
export type ReadinessCode = (typeof READINESS_CODES)[number]

const isReadinessCode = (code: string): code is ReadinessCode => (READINESS_CODES as readonly string[]).includes(code)

/** A code the table does not know reads as null: the item is still listed, with a generic text. */
export const readinessCode = (code: string): ReadinessCode | null => (isReadinessCode(code) ? code : null)

/** Where an item is fixed: the activity's studio, or a workspace tab. */
export type ReadinessTarget = { activityId: string } | { tab: 'content' | 'settings' }

export function readinessTarget(item: ReadinessItem): ReadinessTarget {
  if (item.activity_id) return { activityId: item.activity_id }
  return item.code === 'thumbnail-missing' || item.code === 'certificate-not-configured'
    ? { tab: 'settings' }
    : { tab: 'content' }
}

// ---- Creating an activity: one dialog, three server doors. ----

export type CreatableType = Exclude<ActivityType, 'custom'>
export const CREATABLE_TYPES: readonly CreatableType[] = [
  'dynamic',
  'video',
  'document',
  'file_submission',
  'quiz',
  'exam',
  'code_challenge',
]
export type VideoSource = 'youtube' | 'file'

/**
 * Quiz, exam and code challenge live behind an assessment (its lifecycle publishes the activity); a file submission
 * behind its config. Created through the plain activity door they could never be published (server readiness).
 */
export type CreatePlan =
  | { door: 'activity'; activity_type: ActivityType; activity_sub_type: ActivitySubType }
  | { door: 'assessment'; kind: AssessmentKind }
  | { door: 'file-submission' }

/** The create dialog: the type, its name, and for a video where it comes from. */
export const newActivitySchema = v.object({
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500)),
  type: v.picklist(CREATABLE_TYPES),
  source: v.picklist(['youtube', 'file']),
})
export type NewActivity = v.InferOutput<typeof newActivitySchema>

export function createPlan(type: CreatableType, source: VideoSource): CreatePlan {
  const plans: Record<CreatableType, CreatePlan> = {
    quiz: { door: 'assessment', kind: 'quiz' },
    exam: { door: 'assessment', kind: 'exam' },
    code_challenge: { door: 'assessment', kind: 'code_challenge' },
    file_submission: { door: 'file-submission' },
    video: {
      door: 'activity',
      activity_type: 'video',
      activity_sub_type: source === 'file' ? 'video_hosted' : 'video_youtube',
    },
    document: { door: 'activity', activity_type: 'document', activity_sub_type: 'document_pdf' },
    dynamic: { door: 'activity', activity_type: 'dynamic', activity_sub_type: 'dynamic_page' },
  }
  return plans[type]
}

// ---- Team ----

export const ASSIGNABLE_ROLES = vContributorRole.options

/** The add form's role (the people come from the picker, outside the form). */
export const roleSchema = v.object({ role: vContributorRole })
export type RoleForm = v.InferOutput<typeof roleSchema>

/** A menu value that is a role the team can be given. */
export const isAssignableRole = (value: string): value is ContributorRole => v.is(vContributorRole, value)

/** The team (creator first, as the server orders it) and the open applications. Inactive rows are not shown. */
export function splitRoster(rows: readonly Contributor[]): { team: Contributor[]; pending: Contributor[] } {
  return {
    team: rows.filter(row => row.status === 'active'),
    pending: rows.filter(row => row.status === 'pending'),
  }
}

// ---- Certificate: `Certification.config` is the designer document; the server PDF reads three keys. ----

export const CERTIFICATE_TYPES = [
  'completion',
  'achievement',
  'assessment',
  'participation',
  'mastery',
  'professional',
  'continuing',
  'specialization',
] as const
export type CertificateType = (typeof CERTIFICATE_TYPES)[number]

export const certificateFieldsSchema = v.object({
  certification_name: v.pipe(v.string(), v.trim(), v.maxLength(200)),
  certification_type: v.picklist(CERTIFICATE_TYPES),
  certificate_instructor: v.pipe(v.string(), v.trim(), v.maxLength(200)),
})
export type CertificateFields = v.InferOutput<typeof certificateFieldsSchema>

const text = (value: unknown): string => (typeof value === 'string' ? value : '')
const isCertificateType = (value: string): value is CertificateType =>
  (CERTIFICATE_TYPES as readonly string[]).includes(value)

export function certificateFields(config: Record<string, unknown>): CertificateFields {
  const type = text(config['certification_type'])
  return {
    certification_name: text(config['certification_name']),
    certification_type: isCertificateType(type) ? type : 'completion',
    certificate_instructor: text(config['certificate_instructor']),
  }
}

/** The fields written over the stored document: keys this page does not edit (legacy designer ones) survive. */
export const certificateConfig = (config: Record<string, unknown>, fields: CertificateFields) => ({
  ...config,
  ...fields,
})

// ---- Media activities: `content` is `unknown` in the contract; these are the stored shapes. ----

export type MediaSource =
  | { kind: 'youtube'; uri: string }
  | { kind: 'file'; key: string; name: string }
  | { kind: 'none' }

/** YouTube rows store `{uri}`; uploaded video and PDF rows `{filename: <storage key>, file_name}`. */
export function mediaSource(activity: Pick<ActivityDetail, 'activity_sub_type' | 'content'>): MediaSource {
  const media: MediaContent = 'content' in activity.content ? {} : activity.content
  if (activity.activity_sub_type === 'video_youtube') {
    return media.uri ? { kind: 'youtube', uri: media.uri } : { kind: 'none' }
  }
  return media.filename
    ? { kind: 'file', key: media.filename, name: media.file_name || media.filename }
    : { kind: 'none' }
}

const YOUTUBE_URL = /^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\/\S+$/i

export const youtubeSchema = v.object({ uri: v.pipe(v.string(), v.trim(), v.regex(YOUTUBE_URL)) })

export const youtubeContent = (uri: string) => ({ uri, type: 'youtube' })

export const fileContent = (upload: FinalizedUpload, fileName: string) => ({
  filename: upload.key,
  upload_id: upload.id,
  file_name: fileName,
})

/** The block type that claims an upload of this media activity (`POST /activities/{id}/blocks`). */
export const mediaBlock = (activityType: string) =>
  activityType === 'video'
    ? ({ blockType: 'video', purpose: 'block-video' } as const)
    : ({ blockType: 'pdf', purpose: 'block-pdf' } as const)
