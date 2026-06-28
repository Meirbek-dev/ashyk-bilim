'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CourseAnalysisEntry } from '@/features/course-analysis/components/course-analysis-entry'
import { StudyCompanionPanel } from '@/features/student-study'

import { QAPanel } from './qa-panel'

export function CourseAIHub({ courseUuid }: { courseUuid: string }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">AI learning support</h2>
        <p className="text-muted-foreground text-sm">
          Course-grounded help for learners and teacher-reviewed quality checks.
        </p>
      </div>
      <Tabs defaultValue="study" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="study">Study</TabsTrigger>
          <TabsTrigger value="questions">Q&A</TabsTrigger>
          <TabsTrigger value="review">Review</TabsTrigger>
        </TabsList>
        <TabsContent value="study" className="mt-4">
          <StudyCompanionPanel courseUuid={courseUuid} />
        </TabsContent>
        <TabsContent value="questions" className="mt-4">
          <QAPanel courseUuid={courseUuid} role="student" />
        </TabsContent>
        <TabsContent value="review" className="mt-4">
          <CourseAnalysisEntry courseUuid={courseUuid} />
        </TabsContent>
      </Tabs>
    </section>
  )
}
