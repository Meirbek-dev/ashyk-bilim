/**
 * InlineQuiz node attributes.
 *
 * The node stores ONLY the assessment_uuid reference — all content
 * (questions, options, correct answers) lives in the canonical Assessment
 * table on the backend.
 */
export interface InlineQuizAttrs {
  /** UUID of the linked assessment. null = not yet created (pending first save). */
  assessmentUuid: string | null
}
