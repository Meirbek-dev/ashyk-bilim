'use client'

import { FlaskConical, Play, Send } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { CodeChallengeProblem, CodeVerdict } from '../domain'
import { verdictLabelKey } from '../domain'

interface CodeArenaHeaderProps {
  problem: CodeChallengeProblem
  verdict: CodeVerdict | null
  isRunning: boolean
  onRunCustom: () => void
  onRunTests: () => void
  onSubmit: () => void
  disabled?: boolean
}

export function CodeArenaHeader({
  problem,
  verdict,
  isRunning,
  onRunCustom,
  onRunTests,
  onSubmit,
  disabled = false,
}: CodeArenaHeaderProps) {
  const t = useTranslations('Activities.CodeChallenges')

  return (
    // UX-290: on a phone the title and the actions wrap onto their own rows.
    <div className="bg-muted/40 flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-4 py-2">
      {/* Center: Title & Info */}
      <div className="flex min-w-0 flex-1 basis-48 items-center gap-3">
        <h1 className="truncate text-sm font-semibold">{problem.title}</h1>
        {problem.difficulty ? (
          <Badge variant={difficultyTone(problem.difficulty)} className="px-1.5 py-0 text-[10px] font-bold uppercase">
            {t(`difficulty.${problem.difficulty.toLowerCase()}`)}
          </Badge>
        ) : null}
        {problem.points ? (
          <span className="text-muted-foreground hidden text-xs md:inline-block">
            {t('pointsShort', { count: problem.points })}
          </span>
        ) : null}
        <VerdictStatus verdict={verdict} />
      </div>

      {/* Right: Timer and execution actions */}
      <div className="flex shrink-0 items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onRunCustom}
          disabled={disabled || isRunning}
          className="h-8 gap-1.5 text-xs"
        >
          <Play className="size-3.5" />
          {t('runCodeShort')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onRunTests}
          disabled={disabled || isRunning}
          className="h-8 gap-1.5 text-xs"
        >
          <FlaskConical className="size-3.5" />
          {t('testCodeShort')}
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={onSubmit}
          disabled={disabled || isRunning}
          className="h-8 gap-1.5 text-xs"
        >
          <Send className="size-3.5" />
          {t('submitCodeShort')}
        </Button>
      </div>
    </div>
  )
}

function VerdictStatus({ verdict }: { verdict: CodeVerdict | null }) {
  const t = useTranslations('Activities.CodeChallenges')
  if (!verdict) return null

  return (
    <span className="text-muted-foreground hidden items-center gap-1.5 text-xs md:inline-flex">
      <span
        className={cn(
          'size-1.5 rounded-full',
          verdict === 'ACCEPTED'
            ? 'bg-lime-500'
            : verdict === 'RUNNING'
              ? 'bg-blue-500'
              : verdict === 'IDLE'
                ? 'bg-muted-foreground/50'
                : 'bg-rose-500',
        )}
      />
      {t(verdictLabelKey(verdict))}
    </span>
  )
}

function difficultyTone(difficulty: string): 'success' | 'warning' | 'destructive' | 'secondary' {
  if (difficulty === 'EASY') return 'success'
  if (difficulty === 'MEDIUM') return 'warning'
  if (difficulty === 'HARD') return 'destructive'
  return 'secondary'
}
