'use client'

import { useTranslations } from 'next-intl'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CourseAnalysisEntry } from '@/features/course-analysis/components/course-analysis-entry'
import { StudyCompanionPanel } from '@/features/student-study'

import { QAPanel } from './qa-panel'

export function CourseAIHub({ courseUuid }: { courseUuid: string }) {
  const t = useTranslations('AiExperience.courseAIHub')
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{t('title')}</h2>
        <p className="text-muted-foreground text-sm">{t('description')}</p>
      </div>
      <Tabs defaultValue="study" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="study">{t('tabStudy')}</TabsTrigger>
          <TabsTrigger value="questions">{t('tabQA')}</TabsTrigger>
          <TabsTrigger value="review">{t('tabReview')}</TabsTrigger>
        </TabsList>
        <TabsContent value="study" className="mt-4">
          <StudyCompanionPanel courseUuid={courseUuid} />
        </TabsContent>
        <TabsContent value="questions" className="mt-4">
          {/* eslint-disable-next-line i18next/no-literal-string */}
          <QAPanel courseUuid={courseUuid} userRole="student" />
        </TabsContent>
        <TabsContent value="review" className="mt-4">
          <CourseAnalysisEntry courseUuid={courseUuid} />
        </TabsContent>
      </Tabs>
    </section>
  )
}
