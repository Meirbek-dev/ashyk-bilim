'use client'

import { Clock, FlaskConical, List, Play, Send } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
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
  const [timeElapsed, setTimeElapsed] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeElapsed(prev => prev + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  return (
    // UX-290: on a phone the title and the actions wrap onto their own rows.
    <div className="bg-muted/40 flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-4 py-2">
      {/* Left: Breadcrumbs & Problem Select */}
      <div className="hidden items-center gap-3 md:flex">
        <span className="text-muted-foreground text-xs font-medium">{t('courseChallenges')}</span>
        <span className="text-muted-foreground">/</span>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-sm font-semibold" />}
          >
            <List className="size-4" />
            {t('problems')}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem className="font-semibold">{problem.title}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-muted-foreground text-xs">{t('practiceModeActive')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

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
            {problem.points} {t('pointsShort')}
          </span>
        ) : null}
        <VerdictStatus verdict={verdict} />
      </div>

      {/* Right: Timer and execution actions */}
      <div className="flex shrink-0 items-center gap-2">
        <div className="bg-muted text-muted-foreground hidden h-8 items-center gap-1.5 rounded-md px-2.5 font-mono text-xs select-none sm:flex">
          <Clock className="size-3.5" />
          {formatTime(timeElapsed)}
        </div>

        <div className="bg-border hidden h-4 w-px sm:block" />

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

function DropdownMenuSeparator() {
  return <div className="bg-border my-1 h-px" />
}

function difficultyTone(difficulty: string): 'success' | 'warning' | 'destructive' | 'secondary' {
  if (difficulty === 'EASY') return 'success'
  if (difficulty === 'MEDIUM') return 'warning'
  if (difficulty === 'HARD') return 'destructive'
  return 'secondary'
}
