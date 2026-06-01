'use client'

import { Archive, Eye, LoaderCircle, MoreHorizontal } from 'lucide-react'
import { useEffect, useState, useTransition } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { loadKindModule } from '@/features/assessments/registry'
import type { KindModule } from '@/features/assessments/registry'
import { useAssessmentStudio } from '@/features/assessments/hooks/useAssessment'
import type { AssessmentLifecycle } from '@/features/assessments/domain'
import { queryKeys } from '@/lib/react-query/queryKeys'
import { apiFetch } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from '@components/ui/AppLink'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface AssessmentStudioWorkspaceProps {
  courseUuid: string
  activityUuid: string
}

const LIFECYCLE_BADGE_VARIANT: Record<AssessmentLifecycle, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  DRAFT: 'secondary',
  SCHEDULED: 'outline',
  PUBLISHED: 'default',
  ARCHIVED: 'destructive',
}

export default function AssessmentStudioWorkspace({ courseUuid, activityUuid }: AssessmentStudioWorkspaceProps) {
  const t = useTranslations('Features.Assessments.Studio')
  const { vm, isLoading, error } = useAssessmentStudio(activityUuid)
  const [kindModule, setKindModule] = useState<KindModule | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isMounted, setIsMounted] = useState(false)
  const queryClient = useQueryClient()

  useEffect(() => {
    setIsMounted(true)
  }, [])

  const lifecycleLabels: Record<AssessmentLifecycle, string> = {
    DRAFT: t('lifecycle.draft'),
    SCHEDULED: t('lifecycle.scheduled'),
    PUBLISHED: t('lifecycle.published'),
    ARCHIVED: t('lifecycle.archived'),
  }

  useEffect(() => {
    if (!vm?.kind) return
    let cancelled = false
    setKindModule(null)
    void loadKindModule(vm.kind).then(module => {
      if (!cancelled) setKindModule(module)
      return module
    })
    return () => {
      cancelled = true
    }
  }, [vm?.kind])

  if (!isMounted || isLoading) {
    return (
      <div className="text-muted-foreground flex min-h-[420px] items-center justify-center text-sm">
        <LoaderCircle className="mr-2 size-4 animate-spin" />
        {t('loading')}
      </div>
    )
  }

  if (error || vm?.surface !== 'STUDIO') {
    return <div className="text-muted-foreground rounded-md border border-dashed p-6 text-sm">{t('unavailable')}</div>
  }

  const { vm: studio } = vm
  const previewHref = `/assessments/${studio.assessmentUuid}`

  const archiveAssessment = () => {
    startTransition(async () => {
      try {
        const response = await apiFetch(`assessments/${studio.assessmentUuid}/lifecycle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: 'ARCHIVED', scheduled_at: null }),
        })
        if (!response.ok) throw new Error(response.statusText || 'Failed to archive')
        await queryClient.invalidateQueries({
          queryKey: queryKeys.assessments.activity(activityUuid.replace(/^activity_/, '')),
        })
        toast.success(t('lifecycleChanged', { state: lifecycleLabels.ARCHIVED }))
      } catch (updateError) {
        toast.error(updateError instanceof Error ? updateError.message : t('updateLifecycleFailed'))
      }
    })
  }

  // Resolve slots
  const Author = kindModule?.Author
  const Provider = kindModule?.Provider ?? (({ children }: { children: React.ReactNode }) => <>{children}</>)

  const slotProps = { activityUuid, courseUuid }

  return (
    <div className="bg-background min-h-screen">
      {/* ── Topbar ──────────────────────────────────────────────────────── */}
      <header className="bg-card/95 sticky top-0 z-30 border-b backdrop-blur" style={{ height: '61px' }}>
        <div className="flex h-full items-center justify-between gap-4 px-4 md:px-6">
          {/* Left: breadcrumb + title + lifecycle badge */}
          <div className="min-w-0">
            <div className="text-muted-foreground flex flex-wrap items-center gap-1 text-xs">
              <Link
                href={`/dash/courses/${courseUuid.replace('course_', '')}/curriculum`}
                className="hover:text-foreground"
              >
                {t('breadcrumb.curriculum')}
              </Link>
              <span>/</span>
              <span>{t(`kinds.${studio.kind}`)}</span>
              <span>/</span>
              <span>{t('breadcrumb.studio')}</span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <h1 className="truncate text-base font-semibold">{studio.title}</h1>
              <Badge variant={LIFECYCLE_BADGE_VARIANT[studio.lifecycle]} className="text-xs">
                {lifecycleLabels[studio.lifecycle]}
              </Badge>
            </div>
          </div>

          {/* Right: preview + overflow */}
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={previewHref} target="_blank" />}>
              <Eye className="size-4" />
              {t('preview')}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger
                nativeButton
                render={
                  <Button variant="outline" size="sm" aria-label={t('moreOptions')}>
                    <MoreHorizontal className="size-4" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={isPending || !studio.canArchive}
                  onSelect={archiveAssessment}
                  className="text-destructive focus:text-destructive"
                >
                  <Archive className="mr-2 size-4" />
                  {t('archive')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      {Author ? (
        <Provider {...slotProps}>
          <Author {...slotProps} />
        </Provider>
      ) : (
        <div className="text-muted-foreground flex min-h-[360px] items-center justify-center text-sm">
          <LoaderCircle className="mr-2 size-4 animate-spin" />
          {t('loadingEditor')}
        </div>
      )}
    </div>
  )
}
