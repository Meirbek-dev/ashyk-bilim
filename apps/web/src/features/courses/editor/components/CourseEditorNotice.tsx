'use client'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

type CourseEditorNoticeTone = 'default' | 'destructive'

interface CourseEditorNoticeProps {
  title: string
  description?: string
  icon?: LucideIcon
  tone?: CourseEditorNoticeTone
  className?: string
}

export function CourseEditorNotice({
  title,
  description,
  icon: Icon,
  tone = 'default',
  className,
}: CourseEditorNoticeProps) {
  return (
    <Alert variant={tone} className={cn(tone === 'default' && 'border-border bg-muted/40', className)}>
      {Icon ? <Icon className="size-4" aria-hidden /> : null}
      <AlertTitle>{title}</AlertTitle>
      {description ? <AlertDescription>{description}</AlertDescription> : null}
    </Alert>
  )
}
