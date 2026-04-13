import * as v from 'valibot';

export const chapterCreateSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
  description: v.optional(v.string()),
  thumbnail_image: v.optional(v.string()),
  course_uuid: v.string(),
});

export type ChapterCreateValues = v.InferOutput<typeof chapterCreateSchema>;

export const chapterUpdateSchema = v.object({
  name: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(200))),
  description: v.optional(v.string()),
  thumbnail_image: v.optional(v.string()),
});

export type ChapterUpdateValues = v.InferOutput<typeof chapterUpdateSchema>;

const chapterOrderItemSchema = v.object({
  chapter_uuid: v.string(),
  activities_order_by_uuids: v.array(v.string()),
});

export const courseOrderSchema = v.object({
  chapter_order_by_uuids: v.array(chapterOrderItemSchema),
});

export type CourseOrderPayload = v.InferOutput<typeof courseOrderSchema>;
