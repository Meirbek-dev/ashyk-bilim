'use client'

import { queryOptions, useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/react-query/queryKeys'
import * as zod from 'zod'

import { apiJson } from '@/lib/api-client'
import { QaMessage } from '@/lib/api/generated/zod'

// The contract declares `citations: Object`, but user turns arrive as `[]`
// (server DTO `QaMessage.citations` is a bare `serde_json::Value`), so the
// generated `qaThread` fetcher rejects every thread with a question in it.
const QaTranscript = zod.array(QaMessage.extend({ citations: zod.unknown() }))

export function qaThreadQueryOptions(courseUuid: string, threadUuid: string) {
  return queryOptions({
    queryKey: queryKeys.courseQa.thread(courseUuid, threadUuid),
    queryFn: ({ signal }) =>
      apiJson(`ai/qa/${courseUuid}/threads/${threadUuid}`, { signal }, value => QaTranscript.parse(value)),
    enabled: Boolean(courseUuid && threadUuid),
  })
}

export function useQAThread(courseUuid: string, threadUuid: string) {
  return useQuery(qaThreadQueryOptions(courseUuid, threadUuid))
}
