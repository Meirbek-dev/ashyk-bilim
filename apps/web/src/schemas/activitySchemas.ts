import * as v from 'valibot';

export const activityTypeEnum = v.picklist([
  'TYPE_VIDEO',
  'TYPE_DOCUMENT',
  'TYPE_DYNAMIC',
  'TYPE_ASSIGNMENT',
  'TYPE_EXAM',
  'TYPE_CODE_CHALLENGE',
  'TYPE_CUSTOM',
] as const);

export const activitySubTypeEnum = v.picklist([
  'SUBTYPE_DYNAMIC_PAGE',
  'SUBTYPE_VIDEO_YOUTUBE',
  'SUBTYPE_VIDEO_HOSTED',
  'SUBTYPE_DOCUMENT_PDF',
] as const);

export const activityCreateSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  activity_type: activityTypeEnum,
  activity_sub_type: v.optional(activitySubTypeEnum),
  published: v.optional(v.boolean()),
  content: v.optional(v.unknown()),
  details: v.optional(v.unknown()),
});

export type ActivityCreateValues = v.InferOutput<typeof activityCreateSchema>;

export const activityUpdateSchema = v.partial(activityCreateSchema);

export type ActivityUpdateValues = v.InferOutput<typeof activityUpdateSchema>;
