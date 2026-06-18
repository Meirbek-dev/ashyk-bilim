'use client'

import type { ComponentType, ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, RotateCcw, ShieldAlert } from 'lucide-react'
import { useTranslations } from 'next-intl'

import type { AssessmentWorkspaceView } from '../studioTypes'
import { useAssessmentStudioContext } from '../context'
import SaveStateBadge from '@/features/assessments/shared/SaveStateBadge'
import type { SaveState } from '@/features/assessments/shared/SaveStateBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface AssessmentWorkspaceNavItem {
  id: AssessmentWorkspaceView
  label: string
  icon: ComponentType<{ className?: string }>
  issueCount?: number
}

interface AssessmentWorkspaceShellProps {
  navItems: AssessmentWorkspaceNavItem[]
  renderView: (view: AssessmentWorkspaceView) => ReactNode
}

export function AssessmentWorkspaceShell({ navItems, renderView }: AssessmentWorkspaceShellProps) {
  const { activeView, saveLedger } = useAssessmentStudioContext()
  const t = useTranslations('Features.Assessments.Studio.Workspace')

  return (
    <div className="bg-background grid min-h-[calc(100vh-61px)] grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
      <AssessmentWorkspaceNavigator items={navItems} />
      <main className="min-w-0 border-x" aria-label={t('mainArea')}>
        <div className="bg-background/95 sticky top-[61px] z-20 flex min-h-14 items-center justify-between gap-3 border-b px-4 backdrop-blur md:px-6">
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs font-medium uppercase">{t('currentView')}</p>
            <h2 className="truncate text-sm font-semibold">{navItems.find(item => item.id === activeView)?.label}</h2>
          </div>
          <AssessmentSaveLedger />
        </div>
        <div aria-live="polite" className="sr-only">
          {saveLedger.liveMessage}
        </div>
        <section aria-label={navItems.find(item => item.id === activeView)?.label}>{renderView(activeView)}</section>
      </main>
      <AssessmentReadinessRail />
    </div>
  )
}

function AssessmentWorkspaceNavigator({ items }: { items: AssessmentWorkspaceNavItem[] }) {
  const { activeView, setActiveView } = useAssessmentStudioContext()
  const t = useTranslations('Features.Assessments.Studio.Workspace')

  return (
    <aside className="bg-muted/20 border-b lg:border-b-0" aria-label={t('navigator')}>
      <div className="sticky top-[61px] space-y-3 p-3">
        <div className="px-2">
          <p className="text-muted-foreground text-xs font-medium uppercase">{t('workspace')}</p>
        </div>
        <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
          {items.map(({ id, label, icon: Icon, issueCount }) => (
            <button
              key={id}
              type="button"
              aria-current={activeView === id ? 'page' : undefined}
              onClick={() => setActiveView(id)}
              className={cn(
                'flex h-10 shrink-0 items-center gap-2 rounded-md px-3 text-left text-sm font-medium transition-colors lg:w-full',
                activeView === id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-background hover:text-foreground',
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="truncate">{label}</span>
              {issueCount ? (
                <span className="ml-auto rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                  {issueCount > 9 ? '9+' : issueCount}
                </span>
              ) : null}
            </button>
          ))}
        </nav>
      </div>
    </aside>
  )
}

function AssessmentSaveLedger() {
  const { saveLedger } = useAssessmentStudioContext()
  const t = useTranslations('Features.Assessments.Studio.Workspace')

  if (saveLedger.entries.length === 0) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        <CheckCircle2 className="size-4 text-lime-600" />
        {t('allSaved')}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <SaveStateBadge state={saveLedger.state} />
      {saveLedger.entries.map(entry => (
        <div key={entry.id} className="text-muted-foreground flex items-center gap-1 text-xs">
          <span>{entry.label}</span>
          <SaveLedgerStateDot state={entry.state} />
          {entry.state === 'error' && entry.retry ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('retrySave', { label: entry.label })}
              onClick={entry.retry}
            >
              <RotateCcw className="size-3.5" />
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function SaveLedgerStateDot({ state }: { state: SaveState }) {
  return (
    <span
      className={cn(
        'size-2 rounded-full',
        state === 'error'
          ? 'bg-destructive'
          : state === 'saving'
            ? 'bg-blue-500'
            : state === 'dirty'
              ? 'bg-amber-500'
              : 'bg-lime-500',
      )}
    />
  )
}

function AssessmentReadinessRail() {
  const { readinessIssues, selectedIssueCode, setSelectedIssueCode, setSelectedItemUuid, setActiveView } =
    useAssessmentStudioContext()
  const t = useTranslations('Features.Assessments.Studio.Workspace')
  const blockers = readinessIssues.filter(issue => issue.severity === 'blocker')

  return (
    <aside className="bg-muted/10" aria-label={t('readinessRail')}>
      <div className="sticky top-[61px] space-y-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-muted-foreground text-xs font-medium uppercase">{t('readiness')}</p>
            <h2 className="text-sm font-semibold">{blockers.length ? t('blocked') : t('ready')}</h2>
          </div>
          <Badge variant={blockers.length ? 'destructive' : 'success'}>
            {blockers.length ? t('blockerCount', { count: blockers.length }) : t('zeroBlockers')}
          </Badge>
        </div>

        {readinessIssues.length === 0 ? (
          <div className="rounded-md border border-lime-200 bg-lime-50 p-3 text-sm text-lime-900 dark:border-lime-900 dark:bg-lime-950/30 dark:text-lime-200">
            <CheckCircle2 className="mb-2 size-4" />
            {t('noIssues')}
          </div>
        ) : (
          <div className="space-y-2">
            {readinessIssues.map(issue => {
              const isSelected = selectedIssueCode === issue.code
              return (
                <button
                  key={`${issue.itemUuid ?? 'assessment'}:${issue.code}`}
                  type="button"
                  onClick={() => {
                    setSelectedIssueCode(issue.code)
                    if (issue.itemUuid) setSelectedItemUuid(issue.itemUuid)
                    setActiveView(issue.view)
                  }}
                  className={cn(
                    'w-full rounded-md border bg-background p-3 text-left text-sm transition-colors hover:border-primary/50',
                    isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-border',
                  )}
                >
                  <div className="flex items-start gap-2">
                    {issue.severity === 'blocker' ? (
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                    ) : (
                      <ShieldAlert className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium">{issue.message}</p>
                      <p className="text-muted-foreground mt-1 text-xs">{issue.why ?? issue.code}</p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </aside>
  )
}
