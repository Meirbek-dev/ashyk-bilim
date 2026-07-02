'use client'

import { BookOpenCheckIcon, GraduationCapIcon, MessageCircleQuestionIcon, ShieldCheckIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CourseAnalysisEntry } from '@/features/course-analysis/components/course-analysis-entry'
import { StudyCompanionPanel } from '@/features/student-study'

import { QAPanel } from './qa-panel'

export function CourseAIHub({ courseUuid }: { courseUuid: string }) {
  const t = useTranslations('AiExperience.courseAIHub')
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
