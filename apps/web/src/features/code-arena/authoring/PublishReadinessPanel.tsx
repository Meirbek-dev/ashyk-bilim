'use client'

import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import { useTranslations } from 'next-intl'

import { Badge } from '@/components/ui/badge'
import type { CodeChallengeSettings } from '@/services/courses/code-challenges'
import { cn } from '@/lib/utils'
import { getFirstBlockingCodeChallengeMarkdownIssue } from '../domain'
import type { CodeChallengeMarkdownIssue } from '../domain'

interface PublishReadinessPanelProps {
  draft: CodeChallengeSettings
}

export function PublishReadinessPanel({ draft }: PublishReadinessPanelProps) {
  const t = useTranslations('Activities.CodeChallenges')
  const markdownIssueText = useMarkdownIssueText()
  const readiness = useMemo(() => buildReadiness(draft, t, markdownIssueText), [draft, t, markdownIssueText])
  const blockersCount = readiness.items.filter(item => !item.ok).length

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="bg-muted/20 flex h-11 shrink-0 items-center justify-between border-b px-4">
        <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
          {t('publishReadinessCheck')}
        </span>
        <Badge variant={blockersCount > 0 ? 'warning' : 'success'} className="text-[10px] font-bold">
          {blockersCount > 0 ? t('issuesPending', { count: blockersCount }) : t('readyToPublish')}
        </Badge>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-6 p-6">
          <div className="bg-card space-y-3 rounded-lg border p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              {blockersCount > 0 ? (
                <AlertTriangle className="size-5 animate-bounce fill-amber-500/10 text-amber-500" />
              ) : (
                <CheckCircle2 className="size-5 fill-emerald-600/10 text-emerald-600" />
              )}
              {blockersCount > 0 ? t('checklistPending') : t('checklistAllPassed')}
            </h3>
            <p className="text-muted-foreground text-xs leading-relaxed">{t('publishReadinessDescription')}</p>
          </div>

          <div className="grid gap-3">
            {readiness.items.map(item => (
              <div
                key={item.id}
                className={cn(
                  'flex items-start gap-3 rounded-lg border p-4 transition-all duration-200',
                  item.ok ? 'border-emerald-500/10 bg-emerald-500/[0.01]' : 'border-amber-500/25 bg-amber-500/[0.01]',
                )}
              >
                <div className="mt-0.5 shrink-0">
                  {item.ok ? (
                    <CheckCircle2 className="size-5 fill-emerald-600/10 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="size-5 fill-amber-500/10 text-amber-500" />
                  )}
                </div>
                <div className="space-y-1">
                  <h4
                    className={cn(
                      'text-sm font-semibold',
                      item.ok ? 'text-foreground' : 'text-amber-800 dark:text-amber-300',
                    )}
                  >
                    {item.label}
                  </h4>
                  <p className="text-muted-foreground text-xs leading-relaxed">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Judge0's sandbox caps (MAX_CPU_TIME_LIMIT 15 s; memory up to 2 GB). */
export const CODE_LIMITS = {
  timeSeconds: { min: 1, max: 15 },
  memoryMb: { min: 32, max: 2048 },
} as const

const within = (value: number | undefined, range: { min: number; max: number }) =>
  typeof value === 'number' && value >= range.min && value <= range.max

/** UX-285: «Problem statement: Raw HTML …» in the page language. */
export function useMarkdownIssueText() {
  const t = useTranslations('Activities.CodeChallenges')
  const tMarkdown = useTranslations('MarkdownEditor')
  return useCallback(
    (issue: CodeChallengeMarkdownIssue) => {
      const field = t(`markdownField.${issue.field}`, { number: issue.number ?? 0 })
      const key = `issues.${issue.issue.code}`
      const message = tMarkdown.has(key) ? tMarkdown(key, issue.issue.params ?? {}) : issue.issue.message
      return `${field}: ${message}`
    },
    [t, tMarkdown],
  )
}

export function buildReadiness(
  settings: CodeChallengeSettings,
  t: AppTranslator,
  markdownIssueText: (issue: CodeChallengeMarkdownIssue) => string,
) {
  const visible = settings.visible_tests ?? []
  const hidden = settings.hidden_tests ?? []
  const referenceSolutions = settings.reference_solutions ?? {}
  const starterCode = settings.starter_code ?? {}
  const markdownIssue = getFirstBlockingCodeChallengeMarkdownIssue(settings)

  const items = [
    {
      id: 'problem',
      label: t('readiness.problem.label'),
      ok: Boolean((settings.prompt ?? '').trim() && (settings.title ?? '').trim()),
      detail: t('readiness.problem.detail'),
    },
    {
      id: 'languages',
      label: t('readiness.languages.label'),
      ok:
        (settings.allowed_languages ?? []).length > 0 &&
        settings.allowed_languages.every(id => starterCode[id]?.trim() && referenceSolutions[id]?.trim()),
      detail: t('readiness.languages.detail'),
    },
    {
      id: 'visible',
      label: t('readiness.visible.label'),
      ok: visible.some(test => test.input.trim() || test.expected_output.trim()),
      detail: t('readiness.visible.detail'),
    },
    {
      id: 'hidden',
      label: t('readiness.hidden.label'),
      ok: hidden.length > 0,
      detail: t('readiness.hidden.detail'),
    },
    {
      // UX-282: the «Описание» tab has the two inputs this item asks for.
      id: 'limits',
      label: t('readiness.limits.label'),
      ok: within(settings.time_limit, CODE_LIMITS.timeSeconds) && within(settings.memory_limit, CODE_LIMITS.memoryMb),
      detail: t('readiness.limits.detail'),
    },
    {
      id: 'markdown',
      label: t('readiness.markdown.label'),
      ok: !markdownIssue,
      detail: markdownIssue ? markdownIssueText(markdownIssue) : t('readiness.markdown.detail'),
    },
  ]
  return { items }
}
