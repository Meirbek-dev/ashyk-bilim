import * as v from 'valibot'
import { youTubeId } from '#/features/editor'
import { m } from '#/paraglide/messages'

import type {
  ActivityDetail,
  ActivitySubType,
  ActivityType,
  AssessmentKind,
  Block,
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
/** Readiness items of one code together, in the server's order (B-CST-48): one line, every activity linked on it. */
export function groupReadiness(items: readonly ReadinessItem[]): { code: string; items: ReadinessItem[] }[] {
  const groups = new Map<string, ReadinessItem[]>()
  for (const item of items) groups.set(item.code, [...(groups.get(item.code) ?? []), item])
  return [...groups].map(([code, grouped]) => ({ code, items: grouped }))
}

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

/** The team (creator first, as the server orders it), the open applications and the deactivated co-authors. */
export function splitRoster(rows: readonly Contributor[]): {
  team: Contributor[]
  pending: Contributor[]
  inactive: Contributor[]
} {
  return {
    team: rows.filter(row => row.status === 'active'),
    pending: rows.filter(row => row.status === 'pending'),
    inactive: rows.filter(row => row.status === 'inactive'),
  }
}

// ---- Certificate: settings printed by the shared server PDF template. ----

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

const optionalDate = v.pipe(
  v.string(),
  v.trim(),
  v.check(
    value =>
      value === '' ||
      (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
        !Number.isNaN(Date.parse(value)) &&
        new Date(value).toISOString().slice(0, 10) === value),
  ),
)

export const certificateFieldsSchema = v.pipe(
  v.object({
    certification_name: v.pipe(v.string(), v.trim(), v.maxLength(200)),
    certification_type: v.picklist(CERTIFICATE_TYPES),
    certificate_instructor: v.pipe(v.string(), v.trim(), v.maxLength(200)),
    course_start: optionalDate,
    course_end: optionalDate,
    training_hours: v.pipe(
      v.string(),
      v.trim(),
      v.check(value => value === '' || (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 100_000)),
    ),
  }),
  v.forward(
    v.partialCheck(
      [['course_start'], ['course_end']],
      fields => !fields.course_start || !fields.course_end || fields.course_start <= fields.course_end,
    ),
    ['course_end'],
  ),
)
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
    course_start: text(config['course_start']),
    course_end: text(config['course_end']),
    training_hours: text(config['training_hours']),
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

/**
 * A link the lesson player can embed (`youTubeId`): any youtube.com / youtu.be address used to pass, and a channel
 * page or a cut-off id saved fine but showed learners "this address cannot be embedded".
 */
export const youtubeSchema = v.object({
  uri: v.pipe(
    v.string(),
    v.trim(),
    v.rawCheck(({ dataset, addIssue }) => {
      const problem = dataset.typed ? youtubeProblem(dataset.value) : null
      if (problem) addIssue({ message: youtubeProblemText[problem]() })
    }),
  ),
})

export type YoutubeProblem = 'not-link' | 'not-youtube' | 'no-video'

/** What is wrong with a YouTube link (named to the teacher), or null when the player can embed it. */
export function youtubeProblem(uri: string): YoutubeProblem | null {
  if (!/^https:\/\/[^/\s]+/i.test(uri) || !URL.canParse(uri)) return 'not-link'
  const host = new URL(uri).hostname.replace(/^(www|m|music)\./, '')
  if (host !== 'youtube.com' && host !== 'youtu.be') return 'not-youtube'
  return youTubeId(uri) === null ? 'no-video' : null
}

const youtubeProblemText: Record<YoutubeProblem, () => string> = {
  'not-link': m.studio_youtube_not_link,
  'not-youtube': m.studio_youtube_not_youtube,
  'no-video': m.studio_youtube_no_video,
}

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

/** Only the replaced media's claims: keep the new file and unrelated editor blocks. */
export const replacedMediaBlockIds = (blocks: Block[], blockType: string, keptId: string) =>
  blocks.filter(block => block.block_type === blockType && block.id !== keptId).map(block => block.id)

/**
 * The current media file as the learner's player shows it (B-CST-29): a one-block document for the editor's viewer, and
 * the name to link it by (legacy rows kept only the storage key: its last segment).
 */
export function mediaPreview(type: 'video' | 'document', source: { key: string; name: string }) {
  const block = type === 'video' ? 'blockVideo' : 'blockPDF'
  return {
    content: { type: 'doc', content: [{ type: block, attrs: { blockObject: { content: { file_key: source.key } } } }] },
    name: source.name.split('/').pop() || source.name,
  }
}
