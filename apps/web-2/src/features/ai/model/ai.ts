import type { RemediationSession, RemediationStatus, ScopeCapabilities } from '#/shared/api/gen/types.gen'

import type { PanelTab } from '../route'

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
