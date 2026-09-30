import type { AICitation } from '@/features/ai-experience'

export function qaCitations(message: { citations?: unknown }) {
  const value = message.citations
  if (!value || typeof value !== 'object' || !('citations' in value) || !Array.isArray(value.citations)) return []
  return value.citations as AICitation[]
}
