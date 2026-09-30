'use client'

import { queryOptions, useQuery } from '@tanstack/react-query'
import type { Platform } from '@/types/platform'
import { platformCoursesQueryOptions } from '@/features/courses/queries/course.query'
import { platformConfigQueryOptions } from '../queries/platform.query'

interface UsePlatformConfigOptions {
  enabled?: boolean
  initialData?: Platform
  staleTime?: number
}

function platformConfigHookOptions(options: UsePlatformConfigOptions = {}) {
  const { enabled = true, initialData, staleTime } = options

  return queryOptions({
    ...platformConfigQueryOptions(),
    enabled,
    ...(initialData !== undefined ? { initialData } : {}),
    ...(staleTime !== undefined ? { staleTime } : {}),
  })
}

export function usePlatformConfig(options?: UsePlatformConfigOptions) {
  return useQuery(platformConfigHookOptions(options))
}

export function usePlatformCourses() {
  return useQuery(platformCoursesQueryOptions())
}
