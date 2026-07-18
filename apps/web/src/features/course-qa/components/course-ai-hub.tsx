'use client'

import { BookOpenCheckIcon, GraduationCapIcon, MessageCircleQuestionIcon, ShieldCheckIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Badge } from '@/components/ui/badge'
import { ErrorState, InlineError } from '@/components/ui/error-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CourseAnalysisEntry } from '@/features/course-analysis/components/course-analysis-entry'
import { useActivityAIUrlState, useAIScopeCapabilities } from '@/features/ai-experience'
import type { ActivityAIMode, AIScope } from '@/features/ai-experience'
import { StudyCompanionPanel } from '@/features/student-study'

import { QAPanel } from './qa-panel'

interface CourseAIHubProps {
  courseUuid: string
  scope?: AIScope
  variant?: 'inline' | 'panel'
}

export type CourseAISurfaceRoute = 'chat' | 'course-review' | 'unavailable'

export function resolveCourseAISurfaceRoute(
  mode: ActivityAIMode | undefined,
  surface: AIScope['surface'],
): CourseAISurfaceRoute {
  if (mode === 'ask' || mode === 'explain' || mode === 'practice') return 'chat'
  if (mode === 'analyze' && surface === 'course-page') return 'course-review'
  return 'unavailable'
}

export function CourseAIHub({ courseUuid, scope, variant = 'inline' }: CourseAIHubProps) {
  const t = useTranslations('AiExperience.courseAIHub')

  if (variant === 'panel') {
    return <CourseAIHubPanel courseUuid={courseUuid} {...(scope ? { scope } : {})} />
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex max-w-2xl flex-col gap-1">
          <h2 className="text-xl font-semibold tracking-tight">{t('title')}</h2>
          <p className="text-muted-foreground text-sm">{t('description')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">
            <ShieldCheckIcon data-icon="inline-start" aria-hidden="true" />
            {t('groundedBadge')}
          </Badge>
          <Badge variant="outline">
            <BookOpenCheckIcon data-icon="inline-start" aria-hidden="true" />
            {t('reviewBadge')}
          </Badge>
        </div>
      </div>
      <Tabs defaultValue="study" className="w-full">
        <TabsList className="grid min-h-12 w-full grid-cols-3">
          <TabsTrigger value="study">
            <GraduationCapIcon data-icon="inline-start" aria-hidden="true" />
            {t('tabStudy')}
          </TabsTrigger>
          <TabsTrigger value="questions">
            <MessageCircleQuestionIcon data-icon="inline-start" aria-hidden="true" />
            {t('tabQA')}
          </TabsTrigger>
          <TabsTrigger value="review">
            <BookOpenCheckIcon data-icon="inline-start" aria-hidden="true" />
            {t('tabReview')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="study" className="mt-4">
          <StudyCompanionPanel courseUuid={courseUuid} />
        </TabsContent>
        <TabsContent value="questions" className="mt-4">
          <QAPanel courseUuid={courseUuid} />
        </TabsContent>
        <TabsContent value="review" className="mt-4">
          <CourseAnalysisEntry courseUuid={courseUuid} />
        </TabsContent>
      </Tabs>
    </section>
  )
}

function CourseAIHubPanel({ courseUuid, scope }: Pick<CourseAIHubProps, 'courseUuid' | 'scope'>) {
  const t = useTranslations('AiExperience.courseAIHub')
  const tErrors = useTranslations('Errors')
  const { mode: requestedMode } = useActivityAIUrlState()
  const capabilities = useAIScopeCapabilities(scope ?? { courseUuid, surface: 'course-page' })
  const availableModes = capabilities.data?.modes ?? []
  const mode = availableModes.includes(requestedMode) ? requestedMode : availableModes[0]
  const route = resolveCourseAISurfaceRoute(mode, scope?.surface ?? 'course-page')
  const errorNotice = capabilities.isError ? (
    <InlineError title={tErrors('somethingWentWrong')} description={t('capabilityError')} error={capabilities.error} />
  ) : null

  if (capabilities.isLoading) {
    return <Skeleton className="h-32 w-full" />
  }

  if (capabilities.isError && !capabilities.data) {
    return (
      <ErrorState
        className="min-h-48"
        title={tErrors('somethingWentWrong')}
        description={t('capabilityError')}
        error={capabilities.error}
        actionLabel={tErrors('retry')}
        onAction={() => void capabilities.refetch()}
      />
    )
  }

  if (route === 'chat') {
    return (
      <>
        {errorNotice}
        <QAPanel courseUuid={courseUuid} {...(scope?.activityUuid ? { activityUuid: scope.activityUuid } : {})} />
      </>
    )
  }

  if (route === 'course-review') {
    return (
      <>
        {errorNotice}
        <CourseAnalysisEntry courseUuid={courseUuid} />
      </>
    )
  }

  return (
    <>
      {errorNotice}
      <p className="text-muted-foreground p-4 text-sm">{t('unavailable')}</p>
    </>
  )
}
