import { useSuspenseQueries, useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate, useSearch, Link as RouterLink } from '@tanstack/react-router'

import { Sparkles } from 'lucide-react'
import { m } from '#/paraglide/messages'
import type { UserId } from '#/shared/api/gen/types.gen'
import { buttonVariants } from '#/shared/components/button-variants'
import { EmptyState } from '#/shared/components/empty-state'

import { offersAnalysis, panelTabs, pickTab, sessionsOf, unavailableReason, type UnavailableReason } from '../model/ai'
import { capabilitiesOptions, sessionsOptions, type Scope } from '../queries'
import { ChatTab } from './chat-tab'
import { CritiqueTab } from './critique-tab'
import { PanelTabs } from './panel-tabs'
import { RemediationTab } from './remediation-tab'
import { StudyTab } from './study-tab'

const unavailableText: Record<UnavailableReason, () => string> = {
  ai_disabled: m.ai_unavailable_disabled,
  restricted_activity: m.ai_unavailable_restricted,
  other: m.ai_unavailable_other,
}

/** The panel's content: context, tabs from the scope's capabilities, the chosen tab (B-AI-02, B-AI-03). */
export function PanelBody({ scope, userId }: { scope: Scope; userId: UserId }) {
  const search = useSearch({ strict: false })
  const navigate = useNavigate()
  const { data: caps } = useSuspenseQuery(capabilitiesOptions(scope))
  // Only the player offers the learner's remediation: other surfaces read nothing.
  const queries: ReturnType<typeof sessionsOptions>[] =
    scope.surface === 'student-activity' && scope.activityId ? [sessionsOptions(userId)] : []
  const sessions = useSuspenseQueries({ queries }).flatMap(result => sessionsOf(result.data, scope.activityId ?? ''))
  const tabs = panelTabs(caps, sessions.length > 0)
  const tab = pickTab(tabs, search.ai)
  const analysis = offersAnalysis(caps) ? (
    <RouterLink
      to="/teach/courses/$courseId/overview"
      params={{ courseId: scope.courseId }}
      className={buttonVariants({ variant: 'outline' })}
    >
      {m.ai_analysis_link()}
    </RouterLink>
  ) : null
  if (!tab)
    return (
      <div className="flex flex-col gap-4">
        <EmptyState>{unavailableText[unavailableReason(caps)]()}</EmptyState>
        {analysis}
      </div>
    )
  return (
    <div data-density="compact" className="flex flex-col gap-4">
      {caps.context ? (
        // What the assistant answers from, under its mark: the panel's one line of identity.
        <p className="flex items-start gap-2 text-sm text-pretty text-muted-foreground">
          <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0 text-highlight" />
          <span>
            {m.ai_context({ label: caps.context.activity_label ?? caps.context.course_label })} ·{' '}
            {m.ai_sources({ count: caps.context.source_count })}
          </span>
        </p>
      ) : null}
      {tabs.length > 1 ? (
        <PanelTabs
          tabs={tabs}
          current={tab}
          onPick={next => void navigate({ to: '.', search: prev => ({ ...prev, ai: next }), replace: true })}
        />
      ) : null}
      {tab === 'chat' ? (
        <ChatTab courseId={scope.courseId} activityId={scope.activityId} threadId={search.aiThread} />
      ) : null}
      {tab === 'study' ? <StudyTab courseId={scope.courseId} /> : null}
      {tab === 'critique' && scope.activityId ? (
        <CritiqueTab courseId={scope.courseId} activityId={scope.activityId} />
      ) : null}
      {tab === 'remediation' ? <RemediationTab sessions={sessions} userId={userId} /> : null}
      {analysis}
    </div>
  )
}
