export type ItemActionPrompt = 'reviewContent' | 'tooEasy' | 'tooHard' | 'healthy'

export interface OperateItemAnalytics {
  item_uuid: string
  response_count: number
  correct_pct: number | null
  discrimination_index: number | null
}

export interface SubmissionQueueParams {
  status: string
  search: string
  sortBy: string
  sortDir: 'asc' | 'desc'
  page: number
  pageSize: number
  lateOnly: boolean
}

export interface SubmissionWithMetadata {
  submission_uuid: string
  metadata_json?: unknown
}

export interface IntegrityEventSummary {
  totalEvents: number
  affectedSubmissions: number
  topKind: string | null
}

export function buildSubmissionQueuePath(assessmentUuid: string, params: SubmissionQueueParams): string {
  const searchParams = new URLSearchParams()
  if (params.status !== 'ALL') searchParams.set('status', params.status)
  if (params.search.trim()) searchParams.set('search', params.search.trim())
  if (params.lateOnly) searchParams.set('late_only', 'true')
  searchParams.set('sort_by', params.sortBy)
  searchParams.set('sort_dir', params.sortDir)
  searchParams.set('page', String(params.page))
  searchParams.set('page_size', String(params.pageSize))
  return `assessments/${assessmentUuid}/submissions?${searchParams.toString()}`
}

export function getItemActionPrompt(item: OperateItemAnalytics): ItemActionPrompt {
  if (item.response_count === 0) return 'healthy'
  if (item.discrimination_index !== null && item.discrimination_index < 0.1) return 'reviewContent'
  if (item.correct_pct !== null && item.correct_pct >= 90) return 'tooEasy'
  if (item.correct_pct !== null && item.correct_pct <= 35) return 'tooHard'
  return 'healthy'
}

export function countItemActionPrompts(items: OperateItemAnalytics[]): Record<ItemActionPrompt, number> {
  return items.reduce(
    (acc, item) => {
      acc[getItemActionPrompt(item)] += 1
      return acc
    },
    { reviewContent: 0, tooEasy: 0, tooHard: 0, healthy: 0 },
  )
}

export function summarizeIntegrityEvents(submissions: SubmissionWithMetadata[]): IntegrityEventSummary {
  const counts = new Map<string, number>()
  let affectedSubmissions = 0
  for (const submission of submissions) {
    const violations = readViolations(submission.metadata_json)
    if (violations.length === 0) continue
    affectedSubmissions += 1
    for (const violation of violations) {
      counts.set(violation.kind, (counts.get(violation.kind) ?? 0) + (violation.count ?? 1))
    }
  }
  const entries = [...counts.entries()].toSorted((a, b) => b[1] - a[1])
  return {
    totalEvents: entries.reduce((sum, [, count]) => sum + count, 0),
    affectedSubmissions,
    topKind: entries[0]?.[0] ?? null,
  }
}

function readViolations(value: unknown): { kind: string; count?: number }[] {
  if (!value || typeof value !== 'object' || !('violations' in value)) return []
  const violations = (value as { violations?: unknown }).violations
  if (!Array.isArray(violations)) return []
  return violations
    .map(item => {
      if (!item || typeof item !== 'object' || !('kind' in item)) return null
      const kind = String((item as { kind: unknown }).kind)
      const rawCount = 'count' in item ? Number((item as { count?: unknown }).count) : undefined
      return { kind, ...(Number.isFinite(rawCount) ? { count: rawCount } : {}) }
    })
    .filter((item): item is { kind: string; count?: number } => item !== null && item.kind.length > 0)
}
