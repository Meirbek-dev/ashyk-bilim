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

// Route-side helpers: no UI at runtime.
export { evalsOptions, prefetchPanel, runsOptions, settingsOptions, usageSummaryOptions } from './queries'
