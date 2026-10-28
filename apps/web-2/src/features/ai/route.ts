// Route-level code (validateSearch, search, beforeLoad, loaderDeps, head): the route tree keeps it in the entry
// chunk, so this file imports nothing of the feature (AGENTS.md "Entry chunk"); the contract enums are spelled out
// (`ai.test.ts` pins them to the generated ones).
import * as v from 'valibot'

import { searchText } from '#/shared/lib/search-text'

import type { AiRunKind, AiRunStatus } from '#/shared/api/gen/types.gen'

const PANEL_TABS = ['chat', 'study', 'critique', 'remediation'] as const
export type PanelTab = (typeof PANEL_TABS)[number]

/** The panel's URL state (spec 7.8: "тред AI, режим панели"), on every route that mounts the panel. */
export const aiSearchSchema = v.object({
  ai: v.fallback(v.optional(v.picklist(PANEL_TABS)), undefined),
  aiThread: v.fallback(v.optional(v.pipe(v.string(), v.uuid())), undefined),
})

export const RUN_DAYS = [1, 7, 30] as const
export const RUN_STATUSES = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'aborted',
] as const satisfies readonly AiRunStatus[]
export const RUN_KINDS = [
  'course_analysis',
  'submission_analysis',
  'remediation',
  'study_companion',
  'lecture_review',
  'course_qa',
] as const satisfies readonly AiRunKind[]

/** `/admin/ai` URL state: the runs filters and the open run (R-07). 7 days is the server's default too. */
export const adminAiSearchSchema = v.object({
  days: v.fallback(v.optional(v.picklist(RUN_DAYS), 7), 7),
  status: v.fallback(v.optional(v.picklist(RUN_STATUSES)), undefined),
  kind: v.fallback(v.optional(v.picklist(RUN_KINDS)), undefined),
  /** Substring of the provider or model name (the server's `provider` filter). */
  provider: v.fallback(
    v.optional(
      v.pipe(
        searchText,
        v.trim(),
        v.maxLength(100),
        v.transform(text => text || undefined),
      ),
    ),
    undefined,
  ),
  course: v.fallback(v.optional(v.pipe(v.string(), v.uuid())), undefined),
  run: v.fallback(v.optional(v.pipe(v.string(), v.uuid())), undefined),
})
export type AdminAiSearch = v.InferOutput<typeof adminAiSearchSchema>

/** The filter the runs query takes: unset ones are left out. */
export const runsFilter = ({ days, status, kind, provider, course }: AdminAiSearch) => ({
  days,
  ...(status ? { status } : {}),
  ...(kind ? { kind } : {}),
  ...(provider ? { provider } : {}),
  ...(course ? { course_id: course } : {}),
})
