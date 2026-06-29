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
  const activeItem = navItems.find(item => item.id === activeView)

  return (
    <div className="bg-muted/20 grid min-h-[calc(100vh-61px)] grid-cols-1 lg:grid-cols-[232px_minmax(0,1fr)]">
      <AssessmentWorkspaceNavigator items={navItems} />
      <main className="bg-background min-w-0 border-l" aria-label={t('mainArea')}>
        <div className="bg-background/95 sticky top-[61px] z-20 flex min-h-14 items-center justify-between gap-3 border-b px-4 backdrop-blur md:px-6">
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs font-medium uppercase">{t('currentView')}</p>
            <h2 className="truncate text-sm font-semibold">{activeItem?.label}</h2>
          </div>
          <AssessmentSaveLedger />
        </div>
        <div aria-live="polite" className="sr-only">
          {saveLedger.liveMessage}
        </div>
        <AssessmentReadinessStrip />
        <section aria-label={activeItem?.label}>{renderView(activeView)}</section>
      </main>
    </div>
  )
}

function AssessmentWorkspaceNavigator({ items }: { items: AssessmentWorkspaceNavItem[] }) {
  const { activeView, setActiveView } = useAssessmentStudioContext()
  const t = useTranslations('Features.Assessments.Studio.Workspace')

  return (
    <aside className="bg-background border-b lg:border-b-0" aria-label={t('navigator')}>
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
                <span className="ml-auto rounded-full bg-yellow-50 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-200">
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
            ? 'bg-primary'
            : state === 'dirty'
              ? 'bg-yellow-500'
              : 'bg-green-500',
      )}
    />
  )
}

function AssessmentReadinessStrip() {
  const { readinessIssues, selectedIssueCode, setSelectedIssueCode, setSelectedItemUuid, setActiveView } =
    useAssessmentStudioContext()
  const t = useTranslations('Features.Assessments.Studio.Workspace')
  const blockers = readinessIssues.filter(issue => issue.severity === 'blocker')

  return (
    <div className="bg-muted/20 border-b px-4 py-3 md:px-6" aria-label={t('readinessRail')}>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex size-9 items-center justify-center rounded-md border',
              blockers.length
                ? 'bg-yellow-50 text-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-200'
                : 'bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-200',
            )}
          >
            {blockers.length ? <AlertTriangle className="size-4" /> : <CheckCircle2 className="size-4" />}
          </div>
          <div>
            <p className="text-muted-foreground text-xs font-medium uppercase">{t('readiness')}</p>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold">{blockers.length ? t('blocked') : t('ready')}</h2>
              <Badge variant={blockers.length ? 'destructive' : 'success'}>
                {blockers.length ? t('blockerCount', { count: blockers.length }) : t('zeroBlockers')}
              </Badge>
            </div>
          </div>
        </div>

        {readinessIssues.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-300">
            <CheckCircle2 className="size-4" />
            {t('noIssues')}
          </div>
        ) : (
          <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-2 xl:max-w-4xl">
            {readinessIssues.slice(0, 4).map(issue => {
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
                    'bg-background min-w-0 rounded-md border px-3 py-2 text-left text-sm transition-colors hover:border-primary/50',
                    isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-border',
                  )}
                >
                  <div className="flex items-start gap-2">
                    {issue.severity === 'blocker' ? (
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-yellow-700 dark:text-yellow-300" />
                    ) : (
                      <ShieldAlert className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-medium">{issue.message}</p>
                      <p className="text-muted-foreground mt-0.5 truncate text-xs">{issue.why ?? issue.code}</p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
