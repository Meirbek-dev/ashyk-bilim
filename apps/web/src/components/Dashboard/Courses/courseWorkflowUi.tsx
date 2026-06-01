'use client'

import { AlertTriangle, CheckCircle2, CircleDot, Globe, Lock } from 'lucide-react'
import { RadioGroupItem } from '@/components/ui/radio-group'
import type { LucideIcon } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

type CourseWorkflowBadgeTone = 'default' | 'info' | 'success' | 'warning' | 'danger'

const courseWorkflowBadgeToneClass: Record<CourseWorkflowBadgeTone, string> = {
  default: 'border-border bg-background text-foreground',
  info: 'border-border bg-muted/70 text-muted-foreground',
  success: 'border-border bg-muted/60 text-foreground',
  warning: 'border-border bg-muted/60 text-muted-foreground',
  danger: 'border-destructive/20 bg-destructive/10 text-destructive',
}

export function getCourseWorkflowToneClass(tone: CourseWorkflowBadgeTone) {
  return courseWorkflowBadgeToneClass[tone]
}

export function CourseWorkflowBadge({
  tone = 'default',
  icon: Icon,
  children,
  className,
}: {
  tone?: CourseWorkflowBadgeTone
  icon?: LucideIcon
  children: React.ReactNode
  className?: string
}) {
  return (
    <Badge variant="outline" className={cn('gap-1.5', getCourseWorkflowToneClass(tone), className)}>
      {Icon ? <Icon className="size-3.5" aria-hidden /> : null}
      <span>{children}</span>
    </Badge>
  )
}

export const courseWorkflowCardClass = 'rounded-lg border bg-card'

export function CourseStatusBadge({
  status,
  className,
}: {
  status: 'public' | 'private' | 'ready' | 'needs-review' | 'attention' | 'unsaved' | 'live' | 'draft'
  className?: string
}) {
  const t = useTranslations('DashPage.CourseManagement.Workflow.status')
  const config = {
    public: { label: t('public'), tone: 'success' as const, icon: Globe },
    private: { label: t('private'), tone: 'info' as const, icon: Lock },
    ready: { label: t('ready'), tone: 'success' as const, icon: CheckCircle2 },
    'needs-review': {
      label: t('needsReview'),
      tone: 'warning' as const,
      icon: AlertTriangle,
    },
    attention: {
      label: t('attention'),
      tone: 'warning' as const,
      icon: AlertTriangle,
    },
    unsaved: {
      label: t('unsavedChanges'),
      tone: 'warning' as const,
      icon: CircleDot,
    },
    live: { label: t('live'), tone: 'success' as const, icon: Globe },
    draft: { label: t('draft'), tone: 'info' as const, icon: CircleDot },
  }[status]

  return (
    <CourseWorkflowBadge tone={config.tone} icon={config.icon} {...(className === undefined ? {} : { className })}>
      {config.label}
    </CourseWorkflowBadge>
  )
}

export function CourseChoiceCard({
  id,
  value,
  checked,
  title,
  description,
  icon: Icon,
  disabled = false,
  onSelect,
}: {
  id: string
  value: string
  checked: boolean
  title: string
  description: string
  icon: LucideIcon
  disabled?: boolean
  onSelect?: (value: string) => void
}) {
  return (
    <Label
      htmlFor={id}
      onClick={() => {
        if (!disabled) {
          onSelect?.(value)
        }
      }}
      className={cn(
        'flex cursor-pointer items-start gap-4 rounded-lg border p-4 transition-colors duration-150',
        'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1',
        checked
          ? 'border-primary bg-primary/5 text-accent-foreground'
          : 'border-border bg-card text-card-foreground hover:bg-muted/40',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <RadioGroupItem value={value} id={id} className="sr-only" disabled={disabled} />
      <div
        className={cn(
          'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border',
          checked ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border bg-muted text-muted-foreground',
        )}
      >
        <Icon className="size-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="text-foreground text-sm leading-5 font-medium">{title}</div>
        <div className="text-muted-foreground text-sm leading-5">{description}</div>
      </div>
      {checked ? <CheckCircle2 className="text-primary mt-0.5 size-4 shrink-0" aria-hidden /> : null}
    </Label>
  )
}

export const courseWorkflowSummaryCardClass = `${courseWorkflowCardClass} p-5`
export const courseWorkflowMutedPanelClass = 'rounded-lg border bg-muted/50 p-4'
