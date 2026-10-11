import type { QueryClient } from '@tanstack/react-query'

export { assessmentPublishControl } from './ui/publish-control'
export { AssessmentEditPage } from './ui/builder-page'
export { AssessmentSettingsPage } from './ui/settings-page'

// The loaders load on demand: their SDK calls carry the assessment's response schemas, which the route tree (the
// initial bundle) must not.
export const ensureAssessment = async (queryClient: QueryClient, activityId: string) =>
  (await import('./loaders')).ensureAssessment(queryClient, activityId)
export const assessmentHome = async (queryClient: QueryClient, id: string) =>
  (await import('./loaders')).assessmentHome(queryClient, id)
export const ensureAssessmentSettings = async (queryClient: QueryClient, activityId: string) =>
  (await import('./loaders')).ensureAssessmentSettings(queryClient, activityId)
