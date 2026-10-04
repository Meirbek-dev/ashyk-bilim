// Route-level code (validateSearch, search, beforeLoad, loaderDeps, head): the route tree keeps it in the entry
// chunk, so this file imports nothing of the feature (AGENTS.md "Entry chunk"); the contract enums are spelled out
// (`ai.test.ts` pins them to the generated ones).
import * as v from 'valibot'

import type { AiRunKind, AiRunStatus } from '#/shared/api/gen/types.gen'

const PANEL_TABS = ['chat', 'study', 'critique', 'remediation'] as const
export type PanelTab = (typeof PANEL_TABS)[number]

/** The panel's URL state (spec 7.8: "тред AI, режим панели"), on every route that mounts the panel. */
export const aiSearchSchema = v.object({
  ai: v.optional(v.picklist(PANEL_TABS)),
  aiThread: v.optional(v.pipe(v.string(), v.uuid())),
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
  days: v.optional(v.picklist(RUN_DAYS), 7),
  status: v.optional(v.picklist(RUN_STATUSES)),
  kind: v.optional(v.picklist(RUN_KINDS)),
  run: v.optional(v.pipe(v.string(), v.uuid())),
})
export type AdminAiSearch = v.InferOutput<typeof adminAiSearchSchema>

/** The filter the runs query takes: unset ones are left out. */
export const runsFilter = ({ days, status, kind }: AdminAiSearch) => ({
  days,
  ...(status ? { status } : {}),
  ...(kind ? { kind } : {}),
})
