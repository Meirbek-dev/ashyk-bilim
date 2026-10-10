import { m } from '#/paraglide/messages'
import type {
  DisabledReason,
  FileAttemptStatus,
  FileSubmissionLifecycle,
  GradeReleaseMode,
} from '#/shared/api/gen/types.gen'
import type { StatusTone } from '#/shared/components/status-badge'

import type { LATE_KINDS } from '../model/config'
import type { TypeGroup } from '../model/types'

type Status = { label: () => string; tone: StatusTone }

export const attemptStatus = {
  draft: { label: m.submission_status_draft, tone: 'warning' },
  submitted: { label: m.submission_status_submitted, tone: 'info' },
  graded: { label: m.submission_status_graded, tone: 'info' },
  published: { label: m.submission_status_published, tone: 'success' },
  returned: { label: m.submission_status_returned, tone: 'warning' },
} satisfies Record<FileAttemptStatus, Status>

export const lifecycleStatus = {
  draft: { label: m.submission_lifecycle_draft, tone: 'warning' },
  published: { label: m.submission_lifecycle_published, tone: 'success' },
  archived: { label: m.submission_lifecycle_archived, tone: 'neutral' },
} satisfies Record<FileSubmissionLifecycle, Status>

export const lifecycleHints = {
  draft: m.submission_draft_hint,
  published: m.submission_published_hint,
  archived: m.submission_archived_hint,
} satisfies Record<FileSubmissionLifecycle, () => string>

// The quiz vocabulary: a file submission sends the deadline, the remediation gate and the archive (B-FSB-09).
export const reasonLabels = {
  PAST_DUE: m.submission_reason_past_due,
  REMEDIATION_REQUIRED: m.submission_reason_remediation,
  COURSE_ARCHIVED: m.submission_reason_course_archived,
  ARCHIVED: m.submission_reason_course_archived,
  NOT_PUBLISHED: m.submission_reason_other,
  SCHEDULED_NOT_OPEN: m.submission_reason_other,
  MAX_ATTEMPTS_REACHED: m.submission_reason_other,
  TIME_LIMIT_EXPIRED: m.submission_reason_other,
  ACCESS_RESTRICTED: m.submission_reason_other,
  NOT_ENROLLED: m.submission_reason_not_enrolled,
} satisfies Record<DisabledReason, () => string>

export const typeGroupLabels = {
  pdf: m.submission_type_pdf,
  documents: m.submission_type_documents,
  images: m.submission_type_images,
  spreadsheets: m.submission_type_spreadsheets,
  presentations: m.submission_type_presentations,
  archives: m.submission_type_archives,
  code: m.submission_type_code,
} satisfies Record<TypeGroup, () => string>

export const lateKindLabels = {
  none: m.submission_late_kind_none,
  penalty: m.submission_late_kind_penalty,
  cutoff: m.submission_late_kind_cutoff,
} satisfies Record<(typeof LATE_KINDS)[number], () => string>

export const releaseLabels = {
  immediate: m.submission_release_immediate,
  batch: m.submission_release_batch,
} satisfies Record<GradeReleaseMode, () => string>
