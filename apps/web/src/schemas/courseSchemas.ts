import * as v from 'valibot'

// ---------------------------------------------------------------------------
// Course general section
// ---------------------------------------------------------------------------

// Mirrors `UpdateCourseRequest` (name ≤ 500, description ≤ 5000, about ≤ 20000,
// ≤ 20 tags of ≤ 64 chars); the thumbnail travels the upload pipeline separately.
export const courseGeneralSchema = v.object({
  name: v.pipe(v.string(), v.trim(), v.minLength(1, 'title_required'), v.maxLength(100, 'title_too_long')),
  description: v.pipe(v.string(), v.maxLength(5000, 'description_too_long')),
  about: v.optional(v.pipe(v.string(), v.maxLength(20_000, 'about_too_long'))),
  tags: v.pipe(
    v.array(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(64, 'tag_too_long'))),
    v.maxLength(20, 'too_many_tags'),
  ),
})

export type CourseGeneralValues = v.InferOutput<typeof courseGeneralSchema>

// ---------------------------------------------------------------------------
// Course access section
// ---------------------------------------------------------------------------

const courseAccessSchema = v.object({
  public: v.boolean(),
})

export type CourseAccessValues = v.InferOutput<typeof courseAccessSchema>

// ---------------------------------------------------------------------------
// Course contributors section
// ---------------------------------------------------------------------------

const courseContributorsSchema = v.object({
  open_to_contributors: v.boolean(),
})

export type CourseContributorsValues = v.InferOutput<typeof courseContributorsSchema>

// ---------------------------------------------------------------------------
// Course creation wizard (legacy — kept for compatibility)
// ---------------------------------------------------------------------------

export const courseWizardSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1, 'name_required'), v.maxLength(100)),
  description: v.pipe(v.string(), v.minLength(1, 'description_required'), v.maxLength(5000, 'description_too_long')),
  public: v.boolean(),
  template: v.picklist(['blank', 'starter', 'outline'] as const),
  sourceCourseUuid: v.optional(v.string()),
})

export type CourseWizardValues = v.InferOutput<typeof courseWizardSchema>

// ---------------------------------------------------------------------------
// Course create form (new)
// ---------------------------------------------------------------------------

export const courseCreateSchema = v.pipe(
  v.object({
    title: v.pipe(v.string(), v.trim(), v.minLength(1, 'title_required'), v.maxLength(100, 'title_too_long')),
    description: v.pipe(v.string(), v.maxLength(5000, 'description_too_long')),
    structureMode: v.picklist(['blank', 'starter', 'copy-outline'] as const),
    sourceCourseUuid: v.optional(v.string()),
    initialVisibility: v.picklist(['private', 'public'] as const),
    destination: v.picklist(['overview', 'curriculum'] as const),
  }),
  v.check(
    values => values.structureMode !== 'copy-outline' || Boolean(values.sourceCourseUuid?.trim()),
    'source_course_required',
  ),
)

export type CourseCreateValues = v.InferOutput<typeof courseCreateSchema>
