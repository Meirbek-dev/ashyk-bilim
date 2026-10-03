import * as v from 'valibot'

import { vAiRunId, vAiRunKind, vAiRunStatus } from '#/shared/api/gen/valibot.gen'

export const RUN_DAYS = [1, 7, 30] as const

/** `/admin/ai` URL state: the runs filters and the open run (R-07). 7 days is the server's default too. */
export const adminAiSearchSchema = v.object({
  days: v.optional(v.picklist(RUN_DAYS), 7),
  status: v.optional(vAiRunStatus),
  kind: v.optional(vAiRunKind),
  run: v.optional(vAiRunId),
})
export type AdminAiSearch = v.InferOutput<typeof adminAiSearchSchema>

/** The filter the runs query takes: unset ones are left out. */
export const runsFilter = ({ days, status, kind }: AdminAiSearch) => ({
  days,
  ...(status ? { status } : {}),
  ...(kind ? { kind } : {}),
})
