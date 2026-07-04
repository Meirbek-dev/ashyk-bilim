'use client'

import { queryOptions, useQuery } from '@tanstack/react-query'

import { apiFetcher } from '@/lib/api-client'

import type { ActivityAIMode } from './activity-ai-url-state'

export type AISurface = 'student-activity' | 'teacher-studio' | 'teacher-review' | 'course-page' | 'admin'
export type AIContextVisibility = 'student' | 'teacher' | 'admin'
export type AIUserRole = 'student' | 'teacher' | 'author' | 'admin'

export interface AIScope {
  courseUuid: string
  activityUuid?: string | null
  submissionUuid?: string | null
  surface: AISurface
}

export interface AIFeatureCapability {
  key: string
  enabled: boolean
  reason?: string | null
}

export interface AIScopeCapability {
  available: boolean
  role: AIUserRole
  surface: AISurface
  context_visibility: AIContextVisibility
  restricted: boolean
  reason?: string | null
  modes: ActivityAIMode[]
  features: AIFeatureCapability[]
}

function scopeCapabilitiesPath(scope: AIScope) {
  const params = new URLSearchParams({ surface: scope.surface })
  if (scope.activityUuid) params.set('activity_uuid', scope.activityUuid)
  if (scope.submissionUuid) params.set('submission_uuid', scope.submissionUuid)
  return `ai/capabilities/scope/${scope.courseUuid}?${params.toString()}`
}

export function aiScopeCapabilitiesQueryOptions(scope: AIScope) {
  return queryOptions({
    queryKey: ['ai-scope-capabilities', scope],
    queryFn: () => apiFetcher<AIScopeCapability>(scopeCapabilitiesPath(scope)),
    enabled: Boolean(scope.courseUuid),
    staleTime: 30_000,
  })
}

export function useAIScopeCapabilities(scope: AIScope) {
  return useQuery(aiScopeCapabilitiesQueryOptions(scope))
}
