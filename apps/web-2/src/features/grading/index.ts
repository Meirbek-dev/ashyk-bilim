import type { QueryClient } from '@tanstack/react-query'
import { lazy } from 'react'

import type { GradebookSearch, QueueSearch } from './route'

// Route files import only these (and the URL schemas from `route.ts`): the loaders and the screens behind dynamic
// imports, so the grading code and its API calls stay out of the route entry. The router's pending boundary is the
// screens' Suspense.

const reads = () => import('./queries')

export const ensureQueue = async (queryClient: QueryClient, activityId: string, search: QueueSearch) =>
  (await reads()).ensureQueue(queryClient, activityId, search)
export const ensureReview = async (queryClient: QueryClient, activityId: string, id: string, search: QueueSearch) =>
  (await reads()).ensureReview(queryClient, activityId, id, search)
export const ensureResults = async (queryClient: QueryClient, activityId: string) =>
  (await reads()).ensureResults(queryClient, activityId)
export const ensureGradebook = async (queryClient: QueryClient, courseId: string, search: GradebookSearch) =>
  (await reads()).ensureGradebook(queryClient, courseId, search)

export const QueuePage = lazy(() => import('./ui/queue-page').then(module => ({ default: module.QueuePage })))
export const ReviewPage = lazy(() => import('./ui/review-page').then(module => ({ default: module.ReviewPage })))
export const ResultsPage = lazy(() => import('./ui/results-page').then(module => ({ default: module.ResultsPage })))
export const GradebookPage = lazy(() =>
  import('./ui/gradebook-page').then(module => ({ default: module.GradebookPage })),
)
// The route's not-found boundary sits inside its pending (Suspense) boundary.
export const SubmissionNotFound = lazy(() =>
  import('./ui/submission-not-found').then(module => ({ default: module.SubmissionNotFound })),
)
