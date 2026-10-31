// Route-level code (validateSearch, search, beforeLoad, loaderDeps, head): the route tree keeps it in the entry
// chunk, so this file imports nothing of the feature (AGENTS.md "Entry chunk").
import * as v from 'valibot'

/** The metrics periods in days; 30 is the server's default (no `?days=`). */
export const PERIODS = [7, 30, 90] as const

/** `/teach/courses/$courseId/ai-grading?days=`: the metrics period (B-AIG-02); anything else is the default. */
export const aiGradingSearchSchema = v.object({
  days: v.fallback(v.optional(v.picklist(PERIODS)), undefined),
})
export type AiGradingSearch = v.InferOutput<typeof aiGradingSearchSchema>
