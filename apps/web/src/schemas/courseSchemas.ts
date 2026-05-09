import * as v from 'valibot';

// ---------------------------------------------------------------------------
// Learning items
// ---------------------------------------------------------------------------

const isValidLearningsJson = (value: string): boolean => {
  if (!value) return false;
  try {
    const parsed = JSON.parse(value);
    return (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every((i: unknown) => typeof (i as any)?.text === 'string' && (i as any).text.trim().length > 0)
    );
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// Course general section
// ---------------------------------------------------------------------------

export const courseGeneralSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  description: v.pipe(v.string(), v.minLength(1), v.maxLength(1000)),
  about: v.optional(v.string()),
  learnings: v.pipe(v.string(), v.check(isValidLearningsJson, 'learnings_invalid')),
  tags: v.array(v.string()),
  public: v.boolean(),
  thumbnail_type: v.picklist(['image', 'video', 'both'] as const),
});

export type CourseGeneralValues = v.InferOutput<typeof courseGeneralSchema>;

// ---------------------------------------------------------------------------
// Course access section
// ---------------------------------------------------------------------------

export const courseAccessSchema = v.object({
  public: v.boolean(),
});

export type CourseAccessValues = v.InferOutput<typeof courseAccessSchema>;

// ---------------------------------------------------------------------------
// Course contributors section
// ---------------------------------------------------------------------------

export const courseContributorsSchema = v.object({
  open_to_contributors: v.boolean(),
});

export type CourseContributorsValues = v.InferOutput<typeof courseContributorsSchema>;

// ---------------------------------------------------------------------------
// Course creation wizard
// ---------------------------------------------------------------------------

export const courseWizardSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1, 'name_required'), v.maxLength(100)),
  description: v.pipe(v.string(), v.minLength(1, 'description_required'), v.maxLength(500)),
  public: v.boolean(),
  template: v.picklist(['blank', 'starter', 'outline'] as const),
  sourceCourseUuid: v.optional(v.string()),
});

export type CourseWizardValues = v.InferOutput<typeof courseWizardSchema>;
