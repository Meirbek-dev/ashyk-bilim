'use client'

import { useMutation } from '@tanstack/react-query'

import { apiJson } from '@/lib/api-client'

export function useCancelAIRun() {
  return useMutation({
    mutationFn: async (runUuid: string) => {
      await apiJson(`ai/runs/${runUuid}/cancel`, { method: 'POST' })
    },
  })
}
