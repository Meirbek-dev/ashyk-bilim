import { lazy } from 'react'

// The panels (AG-UI client, rxjs, markdown) load behind these lazy boundaries only: wrap each in <Suspense>.
export const AiPanel = lazy(() => import('./ui/ai-panel').then(module => ({ default: module.AiPanel })))
export const AiSheet = lazy(() => import('./ui/ai-sheet').then(module => ({ default: module.AiSheet })))
export const CourseAnalysis = lazy(() =>
  import('./ui/course-analysis').then(module => ({ default: module.CourseAnalysis })),
)
export const AdminAiPage = lazy(() => import('./ui/admin-ai-page').then(module => ({ default: module.AdminAiPage })))
/** The grader workspace's side panel (slice 6.1 review route). */
export const SubmissionAiPanel = lazy(() =>
  import('./ui/submission-ai-panel').then(module => ({ default: module.SubmissionAiPanel })),
)
/** The learner's remediation where it blocks a new attempt (quiz entry, file task, code task). */
export const RemediationGate = lazy(() =>
  import('./ui/remediation-gate').then(module => ({ default: module.RemediationGate })),
)

// Route-side helpers: no UI at runtime.
export {
  capabilitiesOptions,
  evalsOptions,
  prefetchPanel,
  runsOptions,
  settingsOptions,
  usageSummaryOptions,
} from './queries'
// A learner AI entry point on another feature's screen (the course material search on `concepts`) shows only while
// the scope's capabilities have its feature on.
export { featureOn } from './model/ai'
// A run started from another feature's screen (the concept mapper on `concepts`): the same lifecycle and progress line.
export { useAiRun } from './ui/use-ai-run'
export { RunStatus as RunProgress } from './ui/run-status'
