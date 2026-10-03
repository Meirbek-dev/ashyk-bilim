import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import { getLocale } from '#/paraglide/runtime'
import type { CourseId } from '#/shared/api/gen/types.gen'
import { Button } from '#/shared/ui/button'

import { courseAnalysisKey, courseAnalysisOptions, courseAnalysisQueue } from '../queries'
import { AnalysisReport } from './analysis-report'
import { RunStatus } from './run-status'
import { useAiRun } from './use-ai-run'

/** The latest analysis of the course, "Analyze" / "Run again", the run's progress (B-AI-13). */
export function CourseAnalysisBody({ courseId }: { courseId: CourseId }) {
  const { data: analysis } = useSuspenseQuery(courseAnalysisOptions(courseId))
  const run = useAiRun(courseAnalysisQueue(courseId), [courseAnalysisKey(courseId)])
  const start = () => run.start(getLocale())
  return (
    <section className="flex max-w-prose flex-col gap-4">
      <h2 className="text-xl font-semibold">{m.ai_analysis_title()}</h2>
      <p className="text-sm text-muted-foreground">{m.ai_analysis_intro()}</p>
      <div>
        <Button variant="outline" disabled={run.pending} onClick={start}>
          {analysis ? m.ai_reanalyze() : m.ai_analyze()}
        </Button>
      </div>
      <RunStatus state={run.state} onCancel={run.cancel} cancelling={run.cancelling} onRetry={start} />
      {analysis ? (
        <AnalysisReport courseId={courseId} analysis={analysis} />
      ) : (
        <p className="text-muted-foreground">{m.ai_analysis_empty()}</p>
      )}
    </section>
  )
}
