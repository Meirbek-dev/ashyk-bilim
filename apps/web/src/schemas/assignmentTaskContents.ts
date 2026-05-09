/**
 * Valibot schemas mirroring the backend AssignmentTaskConfig discriminated union.
 *
 * Backend source: apps/api/src/db/courses/assignments.py
 *   AssignmentFileTaskConfig / AssignmentQuizTaskConfig /
 *   AssignmentFormTaskConfig / AssignmentOtherTaskConfig
 *
 * Use safeParse against the per-type export (e.g. QuizContentsSchema) at
 * form-submission time to catch shape errors before they reach the server.
 */

import * as v from 'valibot';

// ── FILE_SUBMISSION ───────────────────────────────────────────────────────────

export const FileContentsSchema = v.object({
  kind: v.literal('FILE_SUBMISSION'),
  allowed_mime_types: v.optional(v.array(v.string()), []),
  max_file_size_mb: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1))), null),
  max_files: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
});

export type FileContents = v.InferOutput<typeof FileContentsSchema>;

// ── QUIZ ──────────────────────────────────────────────────────────────────────

export const QuizOptionSchema = v.object({
  optionUUID: v.string(),
  text: v.optional(v.string(), ''),
  fileID: v.optional(v.string(), ''),
  type: v.optional(v.picklist(['text', 'image', 'audio', 'video'] as const), 'text'),
  assigned_right_answer: v.optional(v.boolean(), false),
});

export const QuizQuestionSchema = v.object({
  questionUUID: v.string(),
  questionText: v.optional(v.string(), ''),
  options: v.pipe(v.array(QuizOptionSchema), v.minLength(1, 'Each question must have at least one option')),
});

export const QuizSettingsSchema = v.object({
  max_attempts: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1))), null),
  time_limit_seconds: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1))), null),
  max_score_penalty_per_attempt: v.optional(v.nullable(v.pipe(v.number(), v.minValue(0), v.maxValue(100))), null),
});

export const QuizContentsSchema = v.object({
  kind: v.literal('QUIZ'),
  questions: v.pipe(v.array(QuizQuestionSchema), v.minLength(1, 'Quiz must have at least one question')),
  settings: QuizSettingsSchema,
});

export type QuizContents = v.InferOutput<typeof QuizContentsSchema>;

// ── FORM ──────────────────────────────────────────────────────────────────────

export const FormBlankSchema = v.object({
  blankUUID: v.string(),
  placeholder: v.optional(v.string(), ''),
  correctAnswer: v.optional(v.string(), ''),
  hint: v.optional(v.string(), ''),
});

export const FormQuestionSchema = v.object({
  questionUUID: v.string(),
  questionText: v.optional(v.string(), ''),
  blanks: v.pipe(v.array(FormBlankSchema), v.minLength(1, 'Each question must have at least one blank')),
});

export const FormContentsSchema = v.object({
  kind: v.literal('FORM'),
  questions: v.pipe(v.array(FormQuestionSchema), v.minLength(1, 'Form must have at least one question')),
});

export type FormContents = v.InferOutput<typeof FormContentsSchema>;

// ── OTHER ─────────────────────────────────────────────────────────────────────

export const OtherContentsSchema = v.object({
  kind: v.literal('OTHER'),
  body: v.optional(v.record(v.string(), v.unknown()), {}),
});

export type OtherContents = v.InferOutput<typeof OtherContentsSchema>;

// ── Discriminated union ───────────────────────────────────────────────────────

export const AssignmentTaskContentsSchema = v.variant('kind', [
  FileContentsSchema,
  QuizContentsSchema,
  FormContentsSchema,
  OtherContentsSchema,
]);

export type AssignmentTaskContents = v.InferOutput<typeof AssignmentTaskContentsSchema>;
