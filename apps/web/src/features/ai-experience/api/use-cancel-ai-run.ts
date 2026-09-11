'use client'

import { useMutation } from '@tanstack/react-query'

import { cancelRun } from '@/lib/api/generated/ai/ai'

export function useCancelAIRun() {
  return useMutation({
    mutationFn: (runId: string) => cancelRun(runId),
  })
}
