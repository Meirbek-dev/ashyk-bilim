import * as v from 'valibot'

// ---------------------------------------------------------------------------
// Learning items
// ---------------------------------------------------------------------------

const isValidLearningsJson = (value: string): boolean => {
  if (!value) return false
  try {
    const parsed = JSON.parse(value)
    return (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every((i: unknown) => {
        if (typeof i !== 'object' || i === null) return false
        const item = i as Record<string, unknown>
        return typeof item.text === 'string' && item.text.trim().length > 0
      })
    )
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Course general section
// ---------------------------------------------------------------------------

export const courseGeneralSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  description: v.pipe(v.string(), v.minLength(1), v.maxLength(8000)),
  about: v.optional(v.string()),
  learnings: v.pipe(v.string(), v.check(isValidLearningsJson, 'learnings_invalid')),
  tags: v.array(v.string()),
  public: v.boolean(),
  thumbnail_type: v.picklist(['image', 'video', 'both'] as const),
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
  description: v.pipe(v.string(), v.minLength(1, 'description_required'), v.maxLength(8000)),
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
    title: v.pipe(v.string(), v.minLength(1, 'title_required'), v.maxLength(100, 'title_too_long')),
    description: v.pipe(v.string(), v.minLength(1, 'description_required'), v.maxLength(8000, 'description_too_long')),
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
