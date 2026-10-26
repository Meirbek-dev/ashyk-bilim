import { m } from '#/paraglide/messages'
import type {
  Citation,
  Level,
  RemediationSession,
  RemediationStatus,
  ScopeCapabilities,
  SubmissionAnalysisReport,
} from '#/shared/api/gen/types.gen'

import type { PanelTab } from '../route'

const LEVEL_RANK: Record<Level, number> = { high: 0, medium: 1, low: 2 }

/**
 * Suggestions and findings with the most important first (the model lists them in its own order); equal priorities
 * keep that order, and one without a priority goes last. Each keeps its original index (a finding's id is positional).
 */
export function byPriority<T extends { priority?: Level | null }>(items: readonly T[]): { item: T; index: number }[] {
  const rank = (item: T) => (item.priority ? LEVEL_RANK[item.priority] : 3)
  return items.map((item, index) => ({ item, index })).toSorted((a, b) => rank(a.item) - rank(b.item))
}

const featureOn = (caps: ScopeCapabilities, key: string) =>
  caps.features.some(feature => feature.key === key && feature.enabled)

/**
 * The tabs this scope offers, in order. `modes` (`ask`, `explain`, `practice`, `analyze`) and feature keys are
 * plain strings in the contract (`capabilities.rs`).
 */
export function panelTabs(caps: ScopeCapabilities, hasRemediation: boolean): PanelTab[] {
  if (!caps.available) return []
  const tabs: PanelTab[] = []
  if (caps.modes.includes('ask')) tabs.push('chat')
  if (caps.role === 'student' && (caps.modes.includes('explain') || caps.modes.includes('practice'))) tabs.push('study')
  if (caps.surface === 'teacher-studio' && caps.role !== 'student' && featureOn(caps, 'lecture_authoring_enabled'))
    tabs.push('critique')
  if (caps.surface === 'student-activity' && hasRemediation) tabs.push('remediation')
  return tabs
}

/** The tab in the URL when the scope offers it, else the first one. */
export const pickTab = (tabs: PanelTab[], wanted: PanelTab | undefined): PanelTab | undefined =>
  wanted && tabs.includes(wanted) ? wanted : tabs[0]

/** Teachers on the course page get a link to the course analysis (`analyze` mode). */
export const offersAnalysis = (caps: ScopeCapabilities) => caps.available && caps.modes.includes('analyze')

/** Unavailable reasons the server sends (`capabilities.rs`). */
export type UnavailableReason = 'ai_disabled' | 'restricted_activity' | 'other'
export const unavailableReason = (caps: ScopeCapabilities): UnavailableReason =>
  caps.reason === 'ai_disabled' || caps.reason === 'restricted_activity' ? caps.reason : 'other'

/** A remediation gate still holds while it is assigned, in progress or failed (BUG-179, BUG-185). */
export const gateHolds = (status: RemediationStatus) => status !== 'passed'

/** The learner's sessions of one activity, newest first as the server sends them. */
export const sessionsOf = (sessions: RemediationSession[], activityId: string) =>
  sessions.filter(session => session.activity_id === activityId)

/** `RemediationBundle.pass_threshold`, 70 when the bundle has none (`complete_remediation`). */
export const passThreshold = (session: RemediationSession) => session.lecture.pass_threshold ?? 70

/** Share of the monthly token budget used, 0..100. */
export const budgetUsed = (budget: number, remaining: number) =>
  budget <= 0 ? 0 : Math.min(100, Math.round((100 * (budget - remaining)) / budget))

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i

/**
 * The activity an answer cites (B-AI-27): its `source_uuid`, else the `activity:<id>` the context gave it as
 * `citation_id`; null for any other source (a course outline, an assessment) or an id that is not one.
 */
export function citedActivity(citation: Pick<Citation, 'source_type' | 'source_uuid' | 'citation_id'>): string | null {
  if (citation.source_type !== 'activity') return null
  const id = citation.source_uuid ?? citation.citation_id.replace(/^activity:/, '')
  return UUID.test(id) ? id : null
}

/**
 * A citation's quote as the reader sees it (B-AI-31): the model sometimes quotes the machine form of a source (an
 * activity's settings as JSON, `"prompt":"..."`, or as `max_attempts: 1, file_name: x.pdf` pairs), which reads as
 * noise next to its label; such an excerpt is dropped.
 */
export function readableExcerpt(excerpt: string | null | undefined): string {
  const text = excerpt?.trim() ?? ''
  return /^[{["]|"\w+"\s*:|\b[a-z][a-z0-9]*_[a-z0-9_]+\s*:/.test(text) ? '' : text
}

/**
 * A feedback draft from a submission analysis (B-AI-29), written to the learner: what to go over again (each gap
 * with its goal) and the next step. The summary and a gap's evidence are not in it: they are the analysis for the
 * teacher («учащийся верно решил…», «ждут оценки учителя»). Empty when the analysis names neither.
 */
export function feedbackDraft(report: Pick<SubmissionAnalysisReport, 'knowledge_gaps' | 'next_action'>): string {
  const gaps = (report.knowledge_gaps ?? []).map(gap =>
    gap.remediation_goal ? `- **${gap.concept}**: ${gap.remediation_goal}` : `- **${gap.concept}**`,
  )
  const next = report.next_action?.trim()
  return [
    gaps.length > 0 ? `${m.ai_feedback_gaps()}\n${gaps.join('\n')}` : '',
    next ? m.ai_feedback_next({ step: next }) : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}
