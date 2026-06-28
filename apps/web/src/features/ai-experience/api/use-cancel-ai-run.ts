'use client'

import { useMutation } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api-client'

export function useCancelAIRun() {
  return useMutation({
    mutationFn: async (runUuid: string) => {
      const response = await apiFetch(`ai/runs/${runUuid}/cancel`, { method: 'POST' })
      if (!response.ok) throw new Error('Could not cancel AI run')
    },
  })
}
