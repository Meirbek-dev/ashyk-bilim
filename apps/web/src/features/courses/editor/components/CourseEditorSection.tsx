'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SectionHeader, StickySaveBar } from '@/components/Dashboard/Courses/SectionHeader'
import { cn } from '@/lib/utils'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

interface CourseEditorSectionProps {
  title: string
  description?: string
  children: ReactNode
  className?: string
  contentClassName?: string
  headerContent?: ReactNode
}

interface CourseEditorStagedSectionProps extends CourseEditorSectionProps {
  isDirty: boolean
  isSaving: boolean
  onSave: () => void
  onDiscard: () => void
}

export function CourseEditorSection({
  title,
  description,
  children,
  className,
  contentClassName,
  headerContent,
}: CourseEditorSectionProps) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <CardTitle>{title}</CardTitle>
          {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
        </div>
        {headerContent}
      </CardHeader>
      <CardContent className={cn('flex flex-col gap-4', contentClassName)}>{children}</CardContent>
    </Card>
  )
}

export function CourseEditorStagedSection({
  title,
  description,
  children,
  className,
  contentClassName,
  headerContent,
  isDirty,
  isSaving,
  onSave,
  onDiscard,
}: CourseEditorStagedSectionProps) {
  const headerRef = useRef<HTMLDivElement>(null)
  const [headerInView, setHeaderInView] = useState(true)
  useEffect(() => {
    const node = headerRef.current
    if (!node || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setHeaderInView(entry?.isIntersecting ?? true))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    // overflow-visible: the sticky save bar must stick to the viewport, not the card.
    <Card className={cn('overflow-visible', className)}>
      <CardHeader ref={headerRef} className="flex flex-col gap-3">
        <SectionHeader
          title={title}
          isDirty={isDirty}
          isSaving={isSaving}
          onSave={onSave}
          onDiscard={onDiscard}
          {...(description === undefined ? {} : { description })}
        >
          {headerContent}
        </SectionHeader>
      </CardHeader>
      <CardContent className={cn('flex flex-col gap-4', contentClassName)}>{children}</CardContent>
      {headerInView ? null : (
        <StickySaveBar isDirty={isDirty} isSaving={isSaving} onSave={onSave} onDiscard={onDiscard} />
      )}
    </Card>
  )
}
